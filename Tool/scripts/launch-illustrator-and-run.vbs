Option Explicit

Dim app
Dim scriptPath
Dim startedIllustrator
Dim shell

scriptPath = WScript.Arguments.Item(0)
startedIllustrator = False

On Error Resume Next
Set app = GetObject(, "Illustrator.Application")
If Err.Number <> 0 Then
    Err.Clear
    Set app = CreateObject("Illustrator.Application")
    startedIllustrator = True
End If

If Err.Number <> 0 Or app Is Nothing Then
    WScript.Echo "Cannot start Adobe Illustrator."
    WScript.Quit 1
End If
On Error GoTo 0

If startedIllustrator Then
    Set shell = CreateObject("WScript.Shell")
    WScript.Sleep 900
    If shell.AppActivate("Adobe Illustrator") Then
        shell.SendKeys "{ESC}"
        WScript.Sleep 200
        shell.SendKeys "{ESC}"
    End If
End If

On Error Resume Next
app.DoJavaScriptFile scriptPath
If Err.Number <> 0 Then
    WScript.Echo "Failed to run JSX (" & Err.Number & "): " & Err.Description
    WScript.Quit 1
End If
On Error GoTo 0
