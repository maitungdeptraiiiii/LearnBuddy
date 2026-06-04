$ErrorActionPreference = 'Stop'
$env:GRAPH_DIR = 'C:\Users\Admin\Documents\Educate'
Set-Location 'C:\Users\Admin\.understand-anything\repo\understand-anything-plugin\packages\dashboard'
npx vite --host 127.0.0.1
