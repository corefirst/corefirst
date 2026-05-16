import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import pc from 'picocolors';
import { printError, printInfo } from '../utils/output';

export function makeAppCommand(): Command {
  return new Command('app')
    .description('Launch the CoreFirst desktop app (Electron)')
    .action(() => {
      const cwd = process.cwd();

      // Check for electron in local node_modules
      const electronBin = path.join(cwd, 'node_modules', '.bin', 'electron');
      const electronMain = path.join(cwd, 'electron', 'main.js');

      if (fs.existsSync(electronBin) && fs.existsSync(electronMain)) {
        printInfo('Launching desktop app…');
        const child = spawn(electronBin, [electronMain], {
          stdio: 'inherit',
          cwd,
          detached: true,
        });
        child.unref();
        return;
      }

      // Check for system electron
      const systemElectron = process.platform === 'win32' ? 'electron.cmd' : 'electron';
      if (fs.existsSync(electronMain)) {
        printInfo('Launching desktop app via system electron…');
        const child = spawn(systemElectron, [electronMain], {
          stdio: 'inherit',
          cwd,
          detached: true,
        });
        child.unref();
        return;
      }

      console.log(pc.bold('CoreFirst Desktop App'));
      console.log();
      console.log('To use the desktop app, either:');
      console.log();
      console.log('  1. Run from the project directory after installing Electron:');
      console.log('     ' + pc.cyan('pnpm add -D electron && corefirst app'));
      console.log();
      console.log('  2. Download a pre-built release from:');
      console.log('     ' + pc.cyan('https://github.com/corefirst/corefirst/releases'));
      printError('electron/main.js not found in current directory.');
      process.exit(1);
    });
}
