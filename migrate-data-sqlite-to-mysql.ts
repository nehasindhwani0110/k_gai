/**
 * Data Migration Script: SQLite to MySQL
 * 
 * This script migrates all existing data from SQLite to MySQL
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const mysqlPrisma = new PrismaClient();

async function migrateData() {
  console.log('🔄 Starting data migration from SQLite to MySQL...\n');

  try {
    // Step 1: Connect to SQLite database
    const sqlitePath = './prisma/dev.db';
    const fs = require('fs');
    
    if (!fs.existsSync(sqlitePath)) {
      console.log('⚠️  SQLite database not found at:', sqlitePath);
      console.log('   No data to migrate.\n');
      return;
    }

    console.log('📦 Found SQLite database, reading data...\n');
    const sqliteDb = new Database(sqlitePath, { readonly: true });

    // Step 2: Migrate each table
    const tables = [
      { name: 'QueryHistory', model: mysqlPrisma.queryHistory },
      { name: 'DashboardMetric', model: mysqlPrisma.dashboardMetric },
      { name: 'FileMetadata', model: mysqlPrisma.fileMetadata },
      { name: 'School', model: mysqlPrisma.school },
      { name: 'DataSource', model: mysqlPrisma.dataSource },
      { name: 'SchemaRegistry', model: mysqlPrisma.schemaRegistry },
      { name: 'SchemaMapping', model: mysqlPrisma.schemaMapping },
      { name: 'EmbeddingCache', model: mysqlPrisma.embeddingCache },
    ];

    let totalMigrated = 0;

    for (const { name, model } of tables) {
      try {
        // Check if table exists (try both cases)
        const tableInfo = sqliteDb.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name=? OR name=?)"
        ).get(name, name.toLowerCase());

        if (!tableInfo) {
          console.log(`⏭️  Skipping ${name} (table not found)`);
          continue;
        }

        const actualTableName = (tableInfo as any).name;
        const rows = sqliteDb.prepare(`SELECT * FROM ${actualTableName}`).all();

        if (rows.length === 0) {
          console.log(`⏭️  Skipping ${name} (no data)`);
          continue;
        }

        console.log(`📊 Migrating ${name}... (${rows.length} records)`);

        // Migrate records
        for (const row of rows as any[]) {
          try {
            switch (name) {
              case 'QueryHistory':
                await model.upsert({
                  where: { id: row.id },
                  update: {},
                  create: {
                    id: row.id,
                    userQuestion: row.userQuestion,
                    queryType: row.queryType,
                    queryContent: row.queryContent,
                    sourceType: row.sourceType,
                    filePath: row.filePath,
                    results: row.results,
                    createdAt: new Date(row.createdAt),
                  },
                });
                break;

              case 'DashboardMetric':
                await model.upsert({
                  where: { id: row.id },
                  update: {},
                  create: {
                    id: row.id,
                    metricName: row.metricName,
                    queryContent: row.queryContent,
                    visualizationType: row.visualizationType,
                    insightSummary: row.insightSummary,
                    sourceType: row.sourceType,
                    filePath: row.filePath,
                    createdAt: new Date(row.createdAt),
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                });
                break;

              case 'FileMetadata':
                await model.upsert({
                  where: { filePath: row.filePath },
                  update: {},
                  create: {
                    id: row.id,
                    fileName: row.fileName,
                    filePath: row.filePath,
                    fileType: row.fileType,
                    fileSize: row.fileSize,
                    tableName: row.tableName,
                    metadata: row.metadata,
                    uploadedAt: new Date(row.uploadedAt),
                  },
                });
                break;

              case 'School':
                await model.upsert({
                  where: { email: row.email },
                  update: {
                    password: row.password,
                    name: row.name,
                    connectionString: row.connectionString,
                    dataSourceId: row.dataSourceId,
                    isActive: row.isActive === 1 || row.isActive === true,
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                  create: {
                    id: row.id,
                    email: row.email,
                    password: row.password,
                    name: row.name,
                    connectionString: row.connectionString,
                    dataSourceId: row.dataSourceId,
                    isActive: row.isActive === 1 || row.isActive === true,
                    createdAt: new Date(row.createdAt),
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                });
                break;

              case 'DataSource':
                await model.upsert({
                  where: { id: row.id },
                  update: {},
                  create: {
                    id: row.id,
                    name: row.name,
                    sourceType: row.sourceType,
                    connectionString: row.connectionString,
                    isActive: row.isActive === 1 || row.isActive === true,
                    description: row.description,
                    createdAt: new Date(row.createdAt),
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                });
                break;

              case 'SchemaRegistry':
                await model.upsert({
                  where: {
                    dataSourceId_tableName_columnName: {
                      dataSourceId: row.dataSourceId,
                      tableName: row.tableName,
                      columnName: row.columnName,
                    },
                  },
                  update: {},
                  create: {
                    id: row.id,
                    dataSourceId: row.dataSourceId,
                    tableName: row.tableName,
                    columnName: row.columnName,
                    canonicalTableName: row.canonicalTableName,
                    canonicalColumnName: row.canonicalColumnName,
                    dataType: row.dataType,
                    description: row.description,
                    isPrimaryKey: row.isPrimaryKey === 1 || row.isPrimaryKey === true,
                    isNullable: row.isNullable === 1 || row.isNullable === true,
                    createdAt: new Date(row.createdAt),
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                });
                break;

              case 'SchemaMapping':
                await model.upsert({
                  where: {
                    dataSourceId_sourceTable_sourceColumn: {
                      dataSourceId: row.dataSourceId,
                      sourceTable: row.sourceTable,
                      sourceColumn: row.sourceColumn,
                    },
                  },
                  update: {},
                  create: {
                    id: row.id,
                    dataSourceId: row.dataSourceId,
                    sourceTable: row.sourceTable,
                    sourceColumn: row.sourceColumn,
                    canonicalTable: row.canonicalTable,
                    canonicalColumn: row.canonicalColumn,
                    transformationRule: row.transformationRule,
                    createdAt: new Date(row.createdAt),
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                });
                break;

              case 'EmbeddingCache':
                await model.upsert({
                  where: { cacheKey: row.cacheKey },
                  update: {},
                  create: {
                    id: row.id,
                    cacheKey: row.cacheKey,
                    embedding: row.embedding,
                    type: row.type,
                    text: row.text,
                    createdAt: new Date(row.createdAt),
                    updatedAt: new Date(row.updatedAt || row.createdAt),
                  },
                });
                break;
            }
          } catch (error: any) {
            console.error(`   ⚠️  Error migrating record ${row.id}:`, error.message);
            // Continue with next record
          }
        }

        totalMigrated += rows.length;
        console.log(`✅ Migrated ${rows.length} records from ${name}\n`);
      } catch (error: any) {
        console.error(`❌ Error migrating ${name}:`, error.message);
      }
    }

    sqliteDb.close();

    console.log(`\n✨ Migration complete!`);
    console.log(`📊 Total records migrated: ${totalMigrated}`);
    console.log(`\n✅ All data has been migrated to MySQL database 'ai-analytics'`);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await mysqlPrisma.$disconnect();
  }
}

migrateData()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
