import { extname } from 'path';

import { PluginFunction, PluginValidateFn, Types, removeFederation } from '@graphql-codegen/plugin-helpers';
import { GraphQLSchema, execute, parse } from 'graphql';

interface IntrospectionResultData {
  __schema: {
    types: {
      kind: string;
      name: string;
      possibleTypes:
        | {
            name: string;
          }[]
        | null;
    }[];
  };
}

interface PossibleTypesResultData {
  possibleTypes: {
    [key: string]: string[];
  };
}

/**
 * @description This plugin generates an introspection file but only with Interfaces and Unions, based on your GraphQLSchema.
 *
 * If you are using `apollo-client` and your schema contains `interface` or `union` declaration, it's recommended to use Apollo's Fragment Matcher and the result generated by the plugin.
 *
 * You can read more about it in [`apollo-client` documentation](https://apollographql.com/docs/react/data/fragments/#fragments-on-unions-and-interfaces).
 *
 * Fragment Matcher plugin accepts a TypeScript / JavaScript or a JSON file as an output _(`.ts, .tsx, .js, .jsx, .json`)_.
 *
 * Both in TypeScript and JavaScript a default export is being used.
 *
 * > The output is based on the output you choose for the output file name.
 */
export interface FragmentMatcherConfig {
  /**
   * @description Compatible only with JSON extension, allow you to choose the export type, either `module.exports` or `export default`. Allowed values are: `commonjs`, `es2015`.
   * @default es2015
   *
   * @exampleMarkdown
   * ```yaml {6}
   * generates:
   *   path/to/file.json:
   *     plugins:
   *       - fragment-matcher
   *     config:
   *       module: commonjs
   * ```
   */
  module?: 'commonjs' | 'es2015';
  /**
   * @description Compatible only with TS/TSX/JS/JSX extensions, allow you to generate output based on your Apollo-Client version. Valid values are: `2`, `3`.
   * @default 3
   *
   * @exampleMarkdown
   * ```yaml {6}
   * generates:
   *   path/to/file.ts:
   *     plugins:
   *       - fragment-matcher
   *     config:
   *       apolloClientVersion: 3
   * ```
   */
  apolloClientVersion?: 2 | 3;
  /**
   * @description Create an explicit type based on your schema. This can help IDEs autofill your fragment matcher. This is mostly useful if you do more with your fragment matcher than just pass it to an Apollo-Client.
   * @default false
   *
   * @exampleMarkdown
   * ```yaml {6}
   * generates:
   *   path/to/file.ts:
   *     plugins:
   *       - fragment-matcher
   *     config:
   *       useExplicitTyping: true
   * ```
   */
  useExplicitTyping?: boolean;
  federation?: boolean;
}

const extensions = {
  ts: ['.ts', '.tsx'],
  js: ['.js', '.jsx'],
  json: ['.json'],
};

export const plugin: PluginFunction = async (
  schema: GraphQLSchema,
  _documents,
  pluginConfig: FragmentMatcherConfig,
  info
): Promise<string> => {
  const config: Required<FragmentMatcherConfig> = {
    module: 'es2015',
    federation: false,
    apolloClientVersion: 3,
    useExplicitTyping: false,
    ...pluginConfig,
  };

  const apolloClientVersion = parseInt(config.apolloClientVersion as any);
  const cleanSchema = config.federation ? removeFederation(schema) : schema;
  const { useExplicitTyping } = config;

  const introspection = (await execute({
    schema: cleanSchema,
    document: parse(`
      {
        __schema {
          types {
            kind
            name
            possibleTypes {
              name
            }
          }
        }
      }
    `),
  })) as any;
  const ext = extname(info.outputFile).toLowerCase();

  if (!introspection.data) {
    throw new Error(`Plugin "fragment-matcher" couldn't introspect the schema`);
  }

  const filterUnionAndInterfaceTypes = type => type.kind === 'UNION' || type.kind === 'INTERFACE';
  const createPossibleTypesCollection = (acc, type) => {
    return { ...acc, ...{ [type.name]: type.possibleTypes.map(possibleType => possibleType.name) } };
  };

  const filteredData: IntrospectionResultData | PossibleTypesResultData =
    apolloClientVersion === 2
      ? {
          __schema: {
            ...introspection.data.__schema,
            types: introspection.data.__schema.types.filter(type => type.kind === 'UNION' || type.kind === 'INTERFACE'),
          },
        }
      : {
          possibleTypes: introspection.data.__schema.types
            .filter(filterUnionAndInterfaceTypes)
            .reduce(createPossibleTypesCollection, {}),
        };

  const content = JSON.stringify(filteredData, null, 2);

  if (extensions.json.includes(ext)) {
    return content;
  }

  if (extensions.js.includes(ext)) {
    const defaultExportStatement = config.module === 'es2015' ? `export default` : 'module.exports =';

    return `
      ${defaultExportStatement} ${content}
    `;
  }

  if (extensions.ts.includes(ext)) {
    let typename: string;
    if (apolloClientVersion === 2) {
      typename = `IntrospectionResultData`;
    } else if (apolloClientVersion === 3) {
      typename = `PossibleTypesResultData`;
    }

    let type: string;
    if (useExplicitTyping) {
      type = `export type ${typename} = ${content};`;
    } else if (apolloClientVersion === 2) {
      type = `export interface ${typename} {
        __schema: {
          types: {
            kind: string;
            name: string;
            possibleTypes: {
              name: string;
            }[];
          }[];
        };
      }`;
    } else if (apolloClientVersion === 3) {
      type = `export interface ${typename} {
        possibleTypes: {
          [key: string]: string[]
        }
      }`;
    }

    return `
      ${type}
      const result: ${typename} = ${content};
      export default result;
    `;
  }

  throw new Error(`Extension ${ext} is not supported`);
};

export const validate: PluginValidateFn<any> = async (
  _schema: GraphQLSchema,
  _documents: Types.DocumentFile[],
  config: FragmentMatcherConfig,
  outputFile: string
) => {
  const ext = extname(outputFile).toLowerCase();
  const all = Object.values(extensions).reduce((acc, exts) => [...acc, ...exts], []);

  if (!all.includes(ext)) {
    throw new Error(
      `Plugin "fragment-matcher" requires extension to be one of ${all.map(val => val.replace('.', '')).join(', ')}!`
    );
  }

  if (config.module === 'commonjs' && extensions.ts.includes(ext)) {
    throw new Error(`Plugin "fragment-matcher" doesn't support commonjs modules combined with TypeScript!`);
  }
};
