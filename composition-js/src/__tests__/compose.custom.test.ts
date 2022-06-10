import { composeServices, CompositionResult } from '../compose';
import {
  assert,
  Schema,
} from '@apollo/federation-internals';
import gql from 'graphql-tag';
import './matchers';
import { GraphQLError } from 'graphql';

const expectDirectiveOnElement = (schema: Schema, location: string, directiveName: string, props?: { [key: string]: any }) => {
  const elem = schema.elementByCoordinate(location);
  expect(elem).toBeDefined();
  const directive = elem?.appliedDirectives.find(d => {
    if (d.name !== directiveName) {
      return false;
    }
    if (props) {
      for (const prop in props) {
        if (d.arguments()[prop] !== props[prop]) {
          return false;
        }
      }
    }
    return true;
  });
  expect(directive).toBeDefined();
};

const expectNoDirectiveOnElement = (schema: Schema, location: string, directiveName: string) => {
  const elem = schema.elementByCoordinate(location);
  expect(elem).toBeDefined();
  expect(elem?.hasAppliedDirective(directiveName)).toBe(false);
};

const expectNoErrorsOrHints = (result: CompositionResult): Schema => {
  expect(result.errors).toBeUndefined();
  expect(result.hints?.length).toBe(0);
  const { schema } = result;
  expect(schema).toBeDefined();
  assert(schema, 'schema does not exist');
  return schema;
}

const expectNoDirectiveInSchema = (schema: Schema, directiveName: string) => {
  expect(schema.directive(directiveName)).toBeUndefined();
};


describe('composing custom directives', () => {
  it('executable directive successful merge, custom directive not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveOnElement(schema, 'User.name', 'foo');
    expectNoDirectiveOnElement(schema, 'User.description', 'foo');
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY']);
  });

  it('executable directive successful merge, custom directive exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
    expectDirectiveOnElement(schema, 'User.description', 'foo', { name: 'graphB'});
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY', 'FIELD_DEFINITION']);
  });

  it('executable directive, conflicting definitions not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveOnElement(schema, 'User.description', 'foo');
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY']);
  });

  it('executable directive, conflicting definitions, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.description', 'foo', { name: 'graphB'});
    expectDirectiveOnElement(schema, 'User', 'foo', { name: 'objectB'});
    expect(schema.directive('foo')?.name).toBe('foo');
    expect(schema.directive('foo')?.locations).toEqual(['QUERY', 'FIELD_DEFINITION', 'OBJECT']);
  });

  it('executable directive, incompatible definitions, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!, desc: String!) on QUERY | FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA", desc: "descA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on QUERY | FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0]).toEqual(new GraphQLError('Argument "@foo(desc:)" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "subgraphA" but does not appear in subgraph "subgraphB"'));
  });

  it('type system directive, incompatible definitions, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!, desc: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA", desc: "descA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION | OBJECT
        type User @key(fields: "id") @foo(name: "objectB") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0]).toEqual(new GraphQLError('Argument "@foo(desc:)" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "subgraphA" but does not appear in subgraph "subgraphB"'));
  });

  it('type-system directive, not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveInSchema(schema, 'foo');
    expectNoDirectiveOnElement(schema, 'User.name', 'foo');
  });

  it('type-system directive, exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
  });

  it('type-system directive, repeatable sometimes', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) repeatable on FIELD_DEFINITION
        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    expect(result.errors).toBeUndefined();
    expect(result.hints?.length).toBe(1);
    expect(result.hints?.[0].definition.code).toBe('INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE');
    const { schema } = result;
    expect(schema).toBeDefined();
    if (schema) {
      expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
    }
  });

  it('type-system directive, different locations', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION | OBJECT
        type Query {
          a: User
        }

        type User @key(fields: "id") @foo(name: "objectA") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        directive @foo(name: String!) on FIELD_DEFINITION
        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
    expectDirectiveOnElement(schema, 'User', 'foo', { name: 'objectA'});
  });

  it('type-system directive, core feature, not exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB]);
    const schema = expectNoErrorsOrHints(result);
    expectNoDirectiveInSchema(schema, 'foo');
    expectNoDirectiveOnElement(schema, 'User.name', 'foo');
  });

  it('type-system directive, core feature, directive exposed', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type Query {
          a: User
        }

        type User @key(fields: "id") {
          id: Int
          name: String @foo(name: "graphA")
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
        @link(url: "https://specs.apollo.dev/foo/v1.0", import: ["@foo"])

        directive @foo(name: String!) on FIELD_DEFINITION

        type User @key(fields: "id") {
          id: Int
          description: String @foo(name: "graphB")
        }
      `,
    };
    const result = composeServices([subgraphA, subgraphB], { exposeDirectives: ['@foo']});
    const schema = expectNoErrorsOrHints(result);
    expectDirectiveOnElement(schema, 'User.name', 'foo', { name: 'graphA'});
  });

  it.todo('expose builtin directive');
});