#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`==================================================`);
console.log(`📦 MEMORY VAULT — CLAUDE DESKTOP AUTO-CONFIGURATOR`);
console.log(`==================================================\n`);

// 1. Determine OS and target Claude Desktop config path
const homeDir = os.homedir();
let configPath = '';

if (process.platform === 'win32') {
    configPath = path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
} else if (process.platform === 'darwin') {
    configPath = path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
} else {
    console.error('❌ Error: Automatic local configuration is only supported on Windows and macOS.');
    process.exit(1);
}

// 2. Compute absolute paths based on where this project is sitting
const rootDir = path.resolve(__dirname, '..');
const serverScriptPath = path.join(rootDir, 'src', 'stdio-server.js');

rl.question(`📂 Enter absolute path for your vault directory [Default: ${path.join(rootDir, 'vault')}]: `, (userVaultPath) => {
    const finalVaultDir = userVaultPath.trim() || path.join(rootDir, 'vault');

    // Ensure the vault directory actually exists
    if (!fs.existsSync(finalVaultDir)) {
        fs.mkdirSync(finalVaultDir, { recursive: true });
        console.log(`✨ Created new vault directory at: ${finalVaultDir}`);
    }

    // 3. Read existing configuration or initialize a fresh template
    let configObj = { mcpServers: {} };
    
    if (fs.existsSync(configPath)) {
        try {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            configObj = JSON.parse(rawConfig) || { mcpServers: {} };
            if (!configObj.mcpServers) configObj.mcpServers = {};
        } catch (e) {
            console.log(`⚠️ Warning: Existing config could not be parsed cleanly. Creating fresh configuration profile.`);
        }
    } else {
        // Ensure parent configuration folders exist
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }

    // 4. Inject Memory Vault into configuration schema
    configObj.mcpServers['memory-vault'] = {
        command: 'node',
        args: [serverScriptPath],
        env: {
            VAULT_DIR: finalVaultDir
        }
    };

    // 5. Write configuration changes back safely
    try {
        fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');
        console.log(`\n✅ Success! Configuration injected safely into:`);
        console.log(`👉 ${configPath}\n`);
        console.log(`🔄 Restart your Claude Desktop application to load the tools!`);
    } catch (err) {
        console.error(`❌ Error writing configuration file: ${err.message}`);
    }

    rl.close();
});