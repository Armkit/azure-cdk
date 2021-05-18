var github = require('octonode');
require('dotenv').config();

function getRepo(accessToken: string | undefined) {
    var client = github.client(accessToken);
    var ghrepo = client.repo('Azure/azure-resource-manager-schemas');
    return ghrepo;
}

function filterVersions(body) {
    // Only versions that look like a date
    body = body.filter((schema) => schema.name.match(/^[\d-]+$/) != null);

    // Sort descending by name.
    body.sort((x, y) => x.name < y.name ? 1 : -1);

    return body.filter((schema) => schema.name == '2019-04-01');
}

function fromBase64(s: string) {
    let buffer = Buffer.from(s, "base64");
    return buffer.toString("utf8");    
}

async function hasDeploymentTemplate(ghrepo, schema) {
    let body = await ghrepo.contentsAsync(schema.path);
    body = body[0];

    return body.find(file => file.name == 'deploymentTemplate.json') !== undefined;
}

async function getSchemaWithTemplate(ghrepo) {
    let body = await ghrepo.contentsAsync('/schemas');
    body = body[0];

    body = filterVersions(body);
    
    let i;
    for (i=0; i<body.length; i++) {
        let schema = body[i];

        let containsSchemaList = await hasDeploymentTemplate(ghrepo, schema);
        if (containsSchemaList) {
            return schema;
        }
    }
}

async function getTemplateContents(ghrepo, schema) {
    let path = schema.path + '/deploymentTemplate.json';

    let body = await ghrepo.contentsAsync(path);
    body = body[0];

    
    return fromBase64(body.content);
}

function flatten(arr) {
    // Make sure we need it.
    if (arr.find(element => Array.isArray(element)) === undefined) {
        return arr;
    }

    return arr.reduce(function(accumulated, current) {
        if (Array.isArray(current)) {
            return accumulated.concat(current);
        }
        else {
            return accumulated.push(current);
        }
    }, []);
}

function getRefs(items) {
    if (items === undefined) {
        return [];
    }
    else if (items["$ref"]) {
        return [ items["$ref"] ];
    }
    else if (Array.isArray(items)) {
        return flatten(items.map((value, index, array) => getRefs(value)));
    }
    else {
        return getRefs(items["oneOf"]).concat(getRefs(items["allOf"]));
    }
}

function getResourceList(contents: string) {
    let items = contents['properties'].resources.items;

    // Iterate into the contents and get all the $ref
    let resources = getRefs(items);

    resources = resources
        .filter(resource => resource.startsWith('https://schema.management.azure.com/schemas/2')) // Filter the ones referencing versioned schemas
        .map(resource => resource.substring(0, resource.indexOf('#')))    // Keep the file reference only
        .reduce(function(accumulated, current) { 
            if (!accumulated.find((value) => value === current)) { 
                accumulated.push(current); 
            } 
            return accumulated; 
        }, []); // Remove duplicates

    return resources;
}

async function main() {
    var ghrepo = getRepo(process.env.GITHUB_ACCESS_TOKEN);
    let schema = await getSchemaWithTemplate(ghrepo);
    let contents = await getTemplateContents(ghrepo, schema);

    let resourceList = getResourceList(contents);
    console.log(resourceList);
}

function testFileLoad() {
    let fs = require('fs');

    fs.readFile('sampleDeploymentTemplate.json', 'utf8', function(err, data) {
        if (err) {
            throw Error(err);
        }

        var object = JSON.parse(data);
        let resourceList = getResourceList(object);
        
        console.log(JSON.stringify(resourceList));
    });
}

testFileLoad();

export {}

