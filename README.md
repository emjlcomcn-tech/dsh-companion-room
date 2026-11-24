# DSH 角色小屋

为 DeepSeek Harness 的现有角色提供 3D 小屋、城市地图、派遣、外出和日常作息。安装后选择一个已有的 DSH 工作区，同一工作区打开新会话仍可使用小屋。角色渲染采用不想待在银河系制作的「大肥鱼」。

**从哪里进小屋？** 在运行 DSH 的电脑上，装好插件后用浏览器打开 [本机入口](http://127.0.0.1:8791/)。想用同一网络里的手机或另一台电脑访问，请按 [局域网访问](#局域网访问) 开启并查看连接地址。

## 安装

从 [最新发布页](https://github.com/emjlcomcn-tech/dsh-companion-room/releases/latest) 下载 `dsh-companion-room-0.1.5.tgz`，在 DSH 桌面版的插件管理器里安装。新版已内置大肥鱼，完成首次设置就能显示。4K 教程在 [v0.1.4 发布页](https://github.com/emjlcomcn-tech/dsh-companion-room/releases/tag/v0.1.4)，安装时使用新版文件名。

如果使用命令行，先打开过一次桌面版以完成初始化，再完全退出桌面版，将下面的参数换成发布包的绝对路径。

```shell
dsh plugin --profile desktop add "C:/path/to/dsh-companion-room-0.1.5.tgz"
```

重开 DSH 后打开 [小屋](http://127.0.0.1:8791/)。首次打开会进入设置，选择工作区，填写角色称呼后保存。小屋页的「小屋设置」可以回到此页。端口冲突时，在本地生成的 `companion-room/settings.json` 修改 `port` 后重开 DSH。

## 局域网访问

1. 在运行 DSH 的电脑上打开 [本机入口](http://127.0.0.1:8791/)，完成首次设置并保存。
2. 在同一台电脑上，把 `%USERPROFILE%\.dsh\companion-room` 粘贴到文件资源管理器地址栏。如果设置过 `DSH_HOME`，则打开该目录下的 `companion-room`。用记事本打开 `settings.json`。已有 `"lan": false` 就改成 `"lan": true`。如果没有这一项，就在文件开头的 `{` 后另起一行加上 `"lan": true,`，保留后面的设置。保存后完全退出并重新打开 DSH。
3. 在运行 DSH 的电脑上重新打开小屋，点「☰ 她在想什么」，往下找到「手机（同一个 Wi-Fi）打开」。把那里列出的地址输入同一网络里的手机或另一台电脑的浏览器。地址形如 `http://192.168.1.23:8791/`，每位使用者都用自己电脑上显示的实际地址。

如果出现多个地址，选运行 DSH 的电脑当前使用的 Wi-Fi 或以太网地址。在 Windows 上可运行 `ipconfig`，到相应网卡下找 **IPv4 地址**。如果 Windows 弹出防火墙提示，可在信任的家庭网络选择允许**专用网络**访问。小屋在同网设备上可直接打开，请只在信任的网络启用。

局域网设备可以打开小屋和城市地图。小屋设置和大肥鱼模型在运行 DSH 的电脑上使用。

## 本地配置

- 小屋会从 `DSH_HOME` 读取 DSH 数据目录，未设置则使用当前用户的 `~/.dsh`。配置存于 `companion-room/settings.json`，活动存档按工作区保存在 `companion-room/workspaces/` 下。
- 会话照常使用绑定工作区现有的 DSH 人设与记忆。生成心声时，插件会尝试读取工作区的 `记忆/记忆卡.md` 或 `AGENT.md`。也可将 `personaFile` 设为工作区内的相对文件路径。自动心声和 QQ 功能默认关闭。
- 如已使用生成 `qq-bridge-config.json` 的 QQ 桥，在设置打开 QQ 私聊。插件会核对该 QQ 私聊是否属于选中的工作区。`room_look`、`room_do`、`room_go`、`room_sleep`、`room_snapshot` 可供已绑定的会话使用。自动 QQ 通知默认关闭，相关本地设置为 `qqNotify`。
- 内置的大肥鱼模型和表情贴图位于 `lib/models/`，由「不想待在银河系」制作，经授权随本项目发布。若本机已有完整的四个兼容模型文件，`companion-room/r3d/` 里的文件优先加载。
- 程序生成的小猫随包提供，在小屋设置中启用，默认名字是「小猫」，可自行更名。菲比啾比模型文件不进入发布包。

## 从源码构建

需要 Node.js 22 或更新版本。

```shell
npm install
npm run build
npm test
npm pack
```

修改 `src/` 后重新构建浏览器资源。后端位于 `lib/`。仓库代码按 MIT 提供，Three.js 的许可证见 `THREE-LICENSE.txt`。大肥鱼模型和表情贴图按作者授权使用。
