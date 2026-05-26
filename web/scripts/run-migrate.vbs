Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\.."
exitCode = sh.Run("""C:\Program Files\nodejs\node.exe"" scripts\migrate-project-detail-page.cjs", 0, True)
WScript.Quit exitCode
