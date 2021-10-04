import vscode from 'vscode';

const html = String.raw;

const getWebviewHtml = (host = 'http://localhost:3000/') =>
    // find an extension that supports fake tags for any language
    html`
<!DOCTYPE html>
<html>

<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>

<body>
	<iframe src="${host}" style="border:0;position: fixed;top:0;left:0;width: 100wh;height: 100vh;"></iframe>

</body>

</html>
	`;
export const openWebview = async () => {
    // TODO @high Content-Security-Policy
    const panel = vscode.window.createWebviewPanel(
        'add-dependency',
        'Add Dependency',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
    panel.webview.html = getWebviewHtml();
};
