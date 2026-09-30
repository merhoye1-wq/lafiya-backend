const { PrismaClient } = require('@prisma/client');

// A single shared Prisma client for the whole process (standard practice -
// avoids exhausting DB connections when the app scales beyond one file).
const prisma = new PrismaClient();

module.exports = prisma;
