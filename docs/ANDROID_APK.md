# Android APK 构建与更新

## 当前方案

APK 是 Capacitor Android 原生外壳，启动后在无浏览器工具栏的 WebView 中打开：

```text
https://www.maki3991.xyz
```

包名为 `xyz.maki3991.interactivestudy`。学习资料、网页前端、后端和 AI 服务仍在 VPS 上运行；APK 不内置学习库、GitHub Token 或 AI API Key。

因此：

- VPS 上的网页、后端或 Markdown 更新，重新打开 APK 即可看到，不需要重装。
- 只有全屏、返回、下拉刷新、包名或其他原生外壳变化时，才需要重新打包。
- 更新原生外壳时必须继续使用同一个包名和同一个 release 签名密钥，否则 Android 会把它当成新应用，不能覆盖安装。

## 当前归档口径

首版 Release APK 已构建并完成签名校验。项目当前暂时归档，优先直接使用网页或 APK 开始学习；BOOX 真机上的认证、阅读、反馈、生成和刷新行为作为首次使用时的核对项。除非发现可复现问题或需要改变原生外壳，后续网页、后端和学习资料更新都不需要重新打包 APK。

## 构建 Debug APK

在项目根目录执行：

```powershell
cd client
npm.cmd run build
npx.cmd cap sync android
cd android
cmd.exe /d /c "set JAVA_HOME=C:\Users\Maki1\AppData\Local\Programs\Microsoft\jdk-21.0.12.1+1&& gradlew.bat assembleDebug --no-daemon"
```

输出文件：

```text
client/android/app/build/outputs/apk/debug/app-debug.apk
```

当前 Release APK 已生成。签名密钥位于本机 `client/android/keystore/interactive-study-release.jks`，密码配置位于被忽略的 `client/android/keystore.properties`；两者必须一起单独备份，不能提交到 GitHub。

## 构建正式 Release APK

`client/android/keystore.properties.example` 是配置模板。当前本机已经生成并配置好了 release keystore；如果迁移到另一台电脑，需要同时复制 keystore 文件和 `keystore.properties`，并保持包名不变。

配置完成后执行：

```powershell
cd client/android
cmd.exe /d /c "set JAVA_HOME=C:\Users\Maki1\AppData\Local\Programs\Microsoft\jdk-21.0.12.1+1&& gradlew.bat assembleRelease --no-daemon"
```

正式 APK 输出在 `client/android/app/build/outputs/apk/release/app-release.apk`。如果没有 `keystore.properties`，Release 构建不会自动使用 Debug 密钥。

## 安装到 BOOX

可以把 `app-debug.apk` 传到 BOOX 后直接打开安装。若使用 USB 调试，也可以执行：

```powershell
adb devices
adb install -r client/android/app/build/outputs/apk/debug/app-debug.apk
```

首次启动时，APK 会在收到 VPS 的 401 后弹出原生认证框：用户名默认填入 `studyboox`，密码填写你原来访问网站时使用的 Nginx Basic Auth 密码。认证成功后再检查阅读 Markdown、提交反馈、生成下一篇、下拉刷新、返回文章和退出应用。
