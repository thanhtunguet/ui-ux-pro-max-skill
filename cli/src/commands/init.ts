import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import type { AIType } from '../types/index.js';
import { AI_TYPES } from '../types/index.js';
import { fetchReleases, getLatestRelease, downloadRelease, getAssetUrl } from '../utils/github.js';
import { extractZip, copyFolders, cleanup } from '../utils/extract.js';
import { detectAIType, getAITypeDescription } from '../utils/detect.js';
import { logger } from '../utils/logger.js';

interface InitOptions {
  ai?: AIType;
  version?: string;
  force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  logger.title('UI/UX Pro Max Installer');

  let aiType = options.ai;

  // Auto-detect or prompt for AI type
  if (!aiType) {
    const { detected, suggested } = detectAIType();

    if (detected.length > 0) {
      logger.info(`Detected: ${detected.map(t => chalk.cyan(t)).join(', ')}`);
    }

    const response = await prompts({
      type: 'select',
      name: 'aiType',
      message: 'Select AI assistant to install for:',
      choices: AI_TYPES.map(type => ({
        title: getAITypeDescription(type),
        value: type,
      })),
      initial: suggested ? AI_TYPES.indexOf(suggested) : 0,
    });

    if (!response.aiType) {
      logger.warn('Installation cancelled');
      return;
    }

    aiType = response.aiType as AIType;
  }

  logger.info(`Installing for: ${chalk.cyan(getAITypeDescription(aiType))}`);

  // Fetch release
  const spinner = ora('Fetching release info...').start();

  try {
    let release;
    if (options.version) {
      const releases = await fetchReleases();
      release = releases.find(r => r.tag_name === options.version);
      if (!release) {
        spinner.fail(`Version ${options.version} not found`);
        process.exit(1);
      }
    } else {
      release = await getLatestRelease();
    }

    spinner.text = `Found version: ${release.tag_name}`;

    const assetUrl = getAssetUrl(release);
    if (!assetUrl) {
      spinner.fail('No downloadable asset found in release');
      process.exit(1);
    }

    // Download
    spinner.text = 'Downloading...';
    const tempDir = join(tmpdir(), `uipro-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const zipPath = join(tempDir, 'release.zip');
    await downloadRelease(assetUrl, zipPath);

    // Extract
    spinner.text = 'Extracting...';
    const extractDir = join(tempDir, 'extracted');
    await mkdir(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    // Copy folders
    spinner.text = 'Installing files...';
    const cwd = process.cwd();
    const copiedFolders = await copyFolders(extractDir, cwd, aiType);

    // Cleanup
    await cleanup(tempDir);

    spinner.succeed('Installation complete!');

    // Summary
    console.log();
    logger.info('Installed folders:');
    copiedFolders.forEach(folder => {
      console.log(`  ${chalk.green('+')} ${folder}`);
    });

    console.log();
    logger.success(`UI/UX Pro Max ${release.tag_name} installed successfully!`);

    // Next steps
    console.log();
    console.log(chalk.bold('Next steps:'));
    console.log(chalk.dim('  1. Restart your AI coding assistant'));
    console.log(chalk.dim('  2. Try: "Build a landing page for a SaaS product"'));
    console.log();
  } catch (error) {
    spinner.fail('Installation failed');
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}
