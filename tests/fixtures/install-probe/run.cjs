const vscode = require('vscode');
const assert = require('node:assert/strict');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('promidon.simpleecode');
  assert.ok(extension); assert.equal(extension.packageJSON.version, process.env.SIMPLEECODE_EXPECT_VERSION);
  await extension.activate(); assert.ok(extension.isActive);
  const cfg = vscode.workspace.getConfiguration('simpleecode');
  assert.equal(cfg.get('privacy.showPromptBeforeSending'), true);
  assert.equal(cfg.get('privacy.defaultScope'), 'selection_only');
  assert.equal(cfg.get('updates.checkOnStartup'), false);
  const commands = await vscode.commands.getCommands(true);
  for (const id of ['simpleecode.explainSelection', 'simpleecode.checkForUpdates', 'simpleecode.explainBeginner']) { assert.ok(commands.includes(id), id); }
  if (extension.packageJSON.version === '0.2.0') {
    const doc = await vscode.workspace.openTextDocument({ content: 'const installed = true;', language: 'typescript' });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 23);
    await vscode.commands.executeCommand('simpleecode.explainSelection');
    await vscode.commands.executeCommand('simpleecode.cancelPrompt');
  }
  console.log('PASS: activated installed promidon.simpleecode@' + extension.packageJSON.version + ' from ' + extension.extensionPath);
};
