import * as vscode from 'vscode';

/**
 * Tiny wrapper around a VS Code OutputChannel so the rest of the codebase has a
 * single, mockable logging surface. Created once in `extension.ts` activation.
 */
export class Logger implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;
  private disposed = false;

  constructor(name = 'SimpleeCode') {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(message: string, ...details: unknown[]): void {
    this.write('INFO', message, details);
  }

  warn(message: string, ...details: unknown[]): void {
    this.write('WARN', message, details);
  }

  error(message: string, ...details: unknown[]): void {
    this.write('ERROR', message, details);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.channel.dispose();
  }

  private write(level: string, message: string, details: unknown[]): void {
    if (this.disposed) {
      return;
    }
    const time = new Date().toISOString();
    let line = `[${time}] [${level}] ${message}`;
    if (details.length > 0) {
      const rendered = details
        .map((d) => (typeof d === 'string' ? d : safeStringify(d)))
        .join(' ');
      line += ` ${rendered}`;
    }
    try {
      this.channel.appendLine(line);
    } catch {
      // A closed channel during host teardown must never crash the caller.
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
