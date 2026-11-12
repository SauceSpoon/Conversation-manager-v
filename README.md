# NODE 使用教程

## 一、启动

1. 双击 [start.bat](start.bat)
2. 会弹出两个黑色命令行窗口（别关），然后自动打开浏览器进入画布

关闭：侧边栏最下面「🛑 一键关闭」，或直接关掉那两个黑色窗口。

## 二、API Key 放哪

用记事本打开这个文件：

```
Node/AI/local_agent/local_txt/api_key.txt
```

把你的 DeepSeek API Key 粘进去，保存，重启一下 AI 那个黑色窗口就能用了。

## 三、怎么保存

- **平时不用管**：画布改动自动存在浏览器里，关页面再开都在。这个不好说，导出jason前走的浏览器缓存，开个无痕清理缓存之类的可能直接没了，建议导出。
- **想存成文件备份**：点侧边栏「📁 导出文件夹」→ 选一个文件夹。之后所有改动会实时保存到那个文件夹里的 `canvas_nodes.json`，换电脑拷这个文件夹就行
- 也可以手动导出：菜单里「导出 JSON」会下载一个 json 文件

## 四、怎么导入

两种方式，任选：

1. **从文件夹恢复**（推荐，配合上面的导出文件夹用）：菜单里选「导入文件夹」，选中你之前存的那个文件夹
2. **从 JSON 文件恢复**：菜单里选「导入 JSON」，选中之前下载的 json 文件

导入后画布会变成存档时的样子，接着改动会继续自动保存。

## 五、基本操作速查

| 想做什么 | 怎么做 |
|---|---|
| 建节点 | 画布空白处右键 → 创建节点 |
| 移动画布 | WASD 或按住鼠标中键拖 |
| 缩放 | 滚轮 |
| 移动节点 | 拖节点顶部的标题栏 |
| 给节点起名 | 双击标题栏打字 |
| 和 AI 聊 | 点一下节点，弹出对话框直接发消息 |

## 六、常见问题

**Q：点了发送 AI 没反应？**
确认两个黑色窗口都在（8080 和 5000）。按 F12 看报错：连不上 5000 = AI 窗口没启动；提示 401 / 认证错误 = Key 不对，检查 api_key.txt 里粘对了没。

**Q：换电脑怎么迁移？**
用了「导出文件夹」的，把那个文件夹整个拷到新电脑，再「导入文件夹」；用的「导出 JSON」的，拷 json 文件过去「导入 JSON」。API Key 要在新电脑的 api_key.txt 里重新填一份。

**Q：双击 start.bat 黑窗口一闪就没了？**
多半是电脑没装 Python 或没加进 PATH。命令行里输入 `python --version` 试试，报错就重装 Python（安装时勾选 Add to PATH）。

**Q：「导出文件夹」点了没反应 / 提示不支持？**
选文件夹功能需要 Chrome 或 Edge（86 以上版本）。别的浏览器会自动改成下载 json 文件的方式，功能不受影响，只是不能实时同步文件夹。

---

## NODE User Guide (English)

## 1. Launch

1. Double-click [start.bat](start.bat)
2. Two black console windows will pop up (keep them open), then your browser opens the canvas automatically

To shut down: click 「🛑 一键关闭」 at the bottom of the sidebar, or just close both black windows.

## 2. Where to put the API Key

Open this file with Notepad:

```
Node/AI/local_agent/local_txt/api_key.txt
```

Paste your DeepSeek API Key into it, save, then restart the AI console window.

## 3. How to save

- **Normally you don't need to do anything**: changes are auto-saved in the browser and survive page reloads.It's hard to say. The browser cache you left before exporting Jason may be gone if you open a traceless cache cleanup or something like that. It is recommended to export it.
- **To back up as files**: click 「📁 导出文件夹」 in the sidebar → pick a folder. All changes will be saved in real time to `canvas_nodes.json` inside that folder — copy the whole folder to migrate
- You can also manually export: 「导出 JSON」 downloads a json file

## 4. How to import

Two ways, pick either:

1. **From a folder** (recommended, pairs with folder export above): choose 「导入文件夹」 in the menu and select the folder you saved before
2. **From a JSON file**: choose 「导入 JSON」 and pick the json file you downloaded

After importing, the canvas returns to the archived state, and further changes keep auto-saving.

## 5. Basics at a glance

| I want to... | Do this |
|---|---|
| Create a node | Right-click empty canvas → 创建节点 |
| Pan the canvas | WASD keys, or drag with middle mouse button |
| Zoom | Mouse wheel |
| Move a node | Drag its top title bar |
| Name a node | Double-click the title bar and type |
| Chat with AI | Click a node, a dialog pops up, just type and send |

## 6. FAQ

**Q: Sent a message but the AI doesn't reply?**
Make sure both black windows are running (ports 8080 and 5000). Press F12 to check errors: can't reach 5000 = AI proxy not started; 401 / auth error = wrong Key, check api_key.txt.

**Q: How to migrate to another computer?**
If you used folder export, copy that whole folder over and use folder import; if you exported a JSON file, copy it over and import it. Re-enter the API Key in api_key.txt on the new machine.

**Q: start.bat's black window flashes and disappears?**
Most likely Python isn't installed or not in PATH. Run `python --version` in a terminal; if it errors, reinstall Python with "Add to PATH" checked.

**Q: The folder export button does nothing / says unsupported?**
Folder picking needs Chrome or Edge (version 86+). Other browsers automatically fall back to downloading a json file — everything still works, just without real-time folder sync.
