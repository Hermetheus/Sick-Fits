// THIS FILE CONNCETS TO REMOTE PRISMA DB AND GIVES US THE ABILITY TO QUERY WITH JS

const { Prisma } = require("prisma-binding");

const db = new Prisma({
  typeDefs: "src/generated/prisma.graphql",
  endpoint: process.env.PRISMA_ENDPOINT,
  secret: process.env.PRISMA_SECRET,
  debug: true
});

module.exports = db;
