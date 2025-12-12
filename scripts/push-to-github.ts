// GitHub Push Script - Uses Replit GitHub Integration
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Files/folders to exclude
const EXCLUDE = [
  'node_modules',
  '.git',
  '.cache',
  '.upm',
  'dist',
  '.replit',
  'replit.nix',
  '.config',
  'logs',
  '.env'
];

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    if (EXCLUDE.includes(item)) continue;
    if (item.startsWith('.')) continue;
    
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(baseDir, fullPath);
    
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getAllFiles(fullPath, baseDir));
      } else if (stat.isFile()) {
        files.push(relativePath);
      }
    } catch (e) {
      // Skip files we can't read
    }
  }
  
  return files;
}

async function main() {
  const repoName = process.argv[2] || 'vps-agent';
  
  console.log('🔗 Connecting to GitHub...');
  const octokit = await getGitHubClient();
  
  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`✅ Authenticated as: ${user.login}`);
  
  // Check if repo exists
  let repoEmpty = false;
  try {
    await octokit.repos.get({ owner: user.login, repo: repoName });
    console.log(`📁 Repository ${repoName} exists`);
    
    // Check if it has any commits
    try {
      await octokit.git.getRef({ owner: user.login, repo: repoName, ref: 'heads/main' });
    } catch (e) {
      repoEmpty = true;
    }
  } catch (e: any) {
    if (e.status === 404) {
      console.log(`📁 Creating repository: ${repoName}`);
      await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'VPS Agent - AI-powered server management platform',
        private: false,
        auto_init: true
      });
      console.log(`✅ Repository created`);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      throw e;
    }
  }
  
  // If repo is empty, create initial README via Contents API
  if (repoEmpty) {
    console.log('📝 Initializing empty repository...');
    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: 'README.md',
      message: 'Initial commit',
      content: Buffer.from('# VPS Agent\n\nAI-powered server management platform.').toString('base64')
    });
    console.log('✅ Repository initialized');
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Get all files
  console.log('📦 Collecting files...');
  const projectDir = process.cwd();
  const files = getAllFiles(projectDir);
  console.log(`   Found ${files.length} files`);
  
  // Get the current main branch reference
  console.log('🔍 Getting current branch...');
  const { data: ref } = await octokit.git.getRef({
    owner: user.login,
    repo: repoName,
    ref: 'heads/main'
  });
  const baseCommitSha = ref.object.sha;
  
  // Get the base tree
  const { data: baseCommit } = await octokit.git.getCommit({
    owner: user.login,
    repo: repoName,
    commit_sha: baseCommitSha
  });
  
  // Create blobs for each file
  console.log('📤 Uploading files...');
  const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  
  let uploadCount = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(projectDir, file));
      const base64Content = content.toString('base64');
      
      const { data: blob } = await octokit.git.createBlob({
        owner: user.login,
        repo: repoName,
        content: base64Content,
        encoding: 'base64'
      });
      
      treeItems.push({
        path: file,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
      
      uploadCount++;
      if (uploadCount % 10 === 0) {
        console.log(`   Uploaded ${uploadCount}/${files.length} files...`);
      }
    } catch (e: any) {
      console.log(`   ⚠️ Skipping ${file}: ${e.message}`);
    }
  }
  console.log(`✅ Uploaded ${uploadCount} files`);
  
  // Create tree
  console.log('🌳 Creating tree...');
  const { data: tree } = await octokit.git.createTree({
    owner: user.login,
    repo: repoName,
    tree: treeItems,
    base_tree: baseCommit.tree.sha
  });
  
  // Create commit
  console.log('💾 Creating commit...');
  const { data: commit } = await octokit.git.createCommit({
    owner: user.login,
    repo: repoName,
    message: 'Deploy VPS Agent - Full application code',
    tree: tree.sha,
    parents: [baseCommitSha]
  });
  
  // Update main branch
  await octokit.git.updateRef({
    owner: user.login,
    repo: repoName,
    ref: 'heads/main',
    sha: commit.sha
  });
  
  console.log('');
  console.log('========================================');
  console.log('✅ SUCCESS! Code pushed to GitHub!');
  console.log('========================================');
  console.log('');
  console.log(`📍 Repository: https://github.com/${user.login}/${repoName}`);
  console.log('');
  console.log('To deploy on your VPS, run these commands:');
  console.log('');
  console.log(`   git clone https://github.com/${user.login}/${repoName}.git`);
  console.log(`   cd ${repoName}`);
  console.log('   chmod +x deploy.sh');
  console.log('   ./deploy.sh --anthropic-key "your-api-key"');
  console.log('');
}

main().catch(console.error);
