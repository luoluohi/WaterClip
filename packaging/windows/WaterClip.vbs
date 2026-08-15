Option Explicit

Dim shell, fso, root, http, processEnvironment, command, prepareCommand, prepareExit
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", "http://127.0.0.1:4174/api/health", False
http.Send
If Err.Number = 0 And http.Status = 200 Then
  shell.Run "http://127.0.0.1:4174", 1, False
  WScript.Quit 0
End If
Err.Clear
On Error GoTo 0

Set processEnvironment = shell.Environment("Process")
prepareCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & root & "\Prepare-MuseScore.ps1" & Chr(34) & " -BundleRoot " & Chr(34) & root & Chr(34)
prepareExit = shell.Run(prepareCommand, 0, True)
If prepareExit <> 0 Then
  MsgBox "WaterClip could not prepare the bundled MuseScore runtime. Run WaterClip-console.cmd for details.", 16, "WaterClip"
  WScript.Quit prepareExit
End If

processEnvironment("HOST") = "127.0.0.1"
processEnvironment("PORT") = "4174"
processEnvironment("MUSESCORE_PATH") = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\WaterClip\runtime\musescore-4.7.4\bin\MuseScore4.exe"
processEnvironment("WATERCLIP_STATIC_ROOT") = root & "\app\web"
processEnvironment("WATERCLIP_PID_FILE") = root & "\runtime\waterclip.pid"
processEnvironment("WATERCLIP_OPEN_BROWSER") = "1"

command = Chr(34) & root & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & root & "\app\server\dist\index.js" & Chr(34)
shell.Run command, 0, False
