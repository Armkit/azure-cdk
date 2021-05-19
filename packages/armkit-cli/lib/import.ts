import { CodeMaker } from 'codemaker';
import { JSONSchema4 } from 'json-schema';
import { TypeGenerator } from './type-generator';
import { ImportBase, SchemaConfig } from './base';
import { httpsGet } from './util';

export class ImportArmSchema extends ImportBase {
  protected async generateTypeScript(code: CodeMaker, config: SchemaConfig) {
    const schema = await downloadSchema(config.downloadUrl);
    this.make(code, schema)
  }

  public async make(code: CodeMaker, schema: JSONSchema4) {
    code.line(`// generated by armkit`);
    code.line(`import { ArmResource } from '@yetics/armkit-core';`);
    code.line(`import { Construct } from 'constructs';`);
    code.line();

    const typeGenerator = new TypeGenerator(schema);
    const topLevelObjects = findApiObjectDefinitions(schema)

    for (const o of topLevelObjects) {
      this.emitConstructForApiObject(typeGenerator, o);
    }

    typeGenerator.generate(code);
  }

  private emitConstructForApiObject(typeGenerator: TypeGenerator, apidef: DeploymentObjectDefinition) {
    typeGenerator.emitConstruct({
      fqn: `${apidef.namespace}.${apidef.name}`,
      kind: apidef.name,
      schema: apidef.schema
    });
  }
}

export function findApiObjectDefinitions(schema: JSONSchema4): DeploymentObjectDefinition[] {
  const list: DeploymentObjectDefinition[] = [];

  for (const [typename, def] of Object.entries(schema.resourceDefinitions as JSONSchema4 || {})) {
    list.push({
      namespace: schema.title || 'undefined',
      name: typename,
      schema: def
    });
  }

  return list
}

interface DeploymentObjectName {
  namespace: string;
  name: string;
}

interface DeploymentObjectDefinition extends DeploymentObjectName {
  schema: JSONSchema4;
}

async function downloadSchema(url: string) {
  const SCHEMA_URL = process.env.SCHEMA_DEFINITION_URL || url;
  const output = await httpsGet(SCHEMA_URL)
  return JSON.parse(output.toString()) as JSONSchema4;
}
