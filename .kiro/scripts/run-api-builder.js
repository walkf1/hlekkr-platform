#!/usr/bin/env node

/**
 * CLI script to run the API Endpoint Builder
 * This script is executed by the Kiro hook when API Gateway files are modified
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function main() {
  try {
    console.log('🚀 Starting API Endpoint Builder...');
    
    // Get changed files from command line arguments or environment
    const changedFiles = process.argv.slice(2);
    
    if (changedFiles.length === 0) {
      console.log('ℹ️  No files specified, scanning for API configuration files...');
      
      // Scan for API-related files
      const infraPath = path.join(process.cwd(), 'GRACE-1-recovered', 'infrastructure', 'lib');
      const apiFiles = [];
      
      if (fs.existsSync(infraPath)) {
        const files = fs.readdirSync(infraPath);
        for (const file of files) {
          if (file.includes('api') || file.includes('stack')) {
            apiFiles.push(path.join(infraPath, file));
          }
        }
      }
      
      if (apiFiles.length === 0) {
        console.log('ℹ️  No API configuration files found');
        return;
      }
      
      changedFiles.push(...apiFiles);
    }
    
    console.log('📁 Processing files:', changedFiles);
    
    // Compile TypeScript if needed
    const tsConfigPath = path.join(process.cwd(), 'GRACE-1-recovered', '.kiro', 'scripts', 'tsconfig.json');
    if (!fs.existsSync(tsConfigPath)) {
      // Create minimal tsconfig for the scripts
      const tsConfig = {
        "compilerOptions": {
          "target": "ES2020",
          "module": "commonjs",
          "lib": ["ES2020"],
          "outDir": "./dist",
          "rootDir": "./",
          "strict": true,
          "esModuleInterop": true,
          "skipLibCheck": true,
          "forceConsistentCasingInFileNames": true,
          "resolveJsonModule": true
        },
        "include": ["*.ts"],
        "exclude": ["node_modules", "dist"]
      };
      
      fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
    }
    
    // Compile the TypeScript file
    const scriptDir = path.dirname(__filename);
    const tsFile = path.join(scriptDir, 'api-endpoint-builder.ts');
    const jsFile = path.join(scriptDir, 'api-endpoint-builder.js');
    
    if (fs.existsSync(tsFile)) {
      try {
        console.log('🔧 Compiling TypeScript...');
        execSync(`npx tsc ${tsFile} --outDir ${scriptDir} --target ES2020 --module commonjs --esModuleInterop --skipLibCheck`, {
          cwd: process.cwd(),
          stdio: 'pipe'
        });
      } catch (error) {
        console.warn('⚠️  TypeScript compilation failed, trying to run directly...');
      }
    }
    
    // Import and run the builder
    let ApiEndpointBuilder;
    
    if (fs.existsSync(jsFile)) {
      ApiEndpointBuilder = require('./api-endpoint-builder.js').default;
    } else {
      // Fallback: try to run with ts-node if available
      try {
        require('ts-node/register');
        ApiEndpointBuilder = require('./api-endpoint-builder.ts').default;
      } catch (error) {
        console.error('❌ Could not load API Endpoint Builder:', error.message);
        console.log('💡 Try installing ts-node: npm install -g ts-node');
        process.exit(1);
      }
    }
    
    // Run the builder
    const builder = new ApiEndpointBuilder();
    await builder.buildApiComponents(changedFiles);
    
    console.log('✅ API Endpoint Builder completed successfully!');
    
  } catch (error) {
    console.error('❌ API Endpoint Builder failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { main };