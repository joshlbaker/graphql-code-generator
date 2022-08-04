/* eslint-disable no-console */
import { executeOperation } from './executeOperation.js';
import { gql } from './gql/index.js';

const AllPeopleQueryDocument = gql(/* GraphQL */ `
  query AllPeopleQuery {
    allPeople(first: 5) {
      edges {
        node {
          name
          homeworld {
            name
          }
        }
      }
    }
  }
`);

const AllPeopleWithVariablesQueryDocument = gql(/* GraphQL */ `
  query AllPeopleWithVariablesQuery($first: Int!) {
    allPeople(first: $first) {
      edges {
        node {
          name
          homeworld {
            name
          }
        }
      }
    }
  }
`);

const apiUrl = 'https://swapi-graphql.netlify.app/.netlify/functions/index';

executeOperation(apiUrl, AllPeopleQueryDocument).then(res => {
  console.log(res.data?.allPeople.edges);
});

executeOperation(apiUrl, AllPeopleWithVariablesQueryDocument, { first: 10 }).then(res => {
  console.log(res.data?.allPeople.edges);
});
