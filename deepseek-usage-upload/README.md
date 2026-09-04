# DeepSeek Usage Dash(手机端余额/token 看板)

> 非官方工具,与 DeepSeek 无关联。个人学习用途,请遵守 [DeepSeek 开放平台条款](https://api-docs.deepseek.com/) 与你的 API Key 使用协议。

在手机上随时查看 DeepSeek API **账户余额**;配合一个 dsh/gateway 数据源时,还能看
**token 用量、缓存命中率、花费估算与"后台对账"金额**。PWA 形态,可"添加到主屏幕"当 App。

## 功能

- 实时余额、充值/赠送拆分(直连 `api.deepseek.com/user/balance`,已确认允许浏览器跨域)
- (可选)接入 dsh 用量统计上游后显示:今日/累计 token 分桶(输入/缓存/输出)、
  缓存命中率、花费(含高峰/空闲分车道单价)与"余额差值"后台对账金额
- 手机优先的深色 UI,30s 自动刷新
- PWA:HTTPS 下 Chrome「添加到主屏幕」即可当独立应用

## 两种数据链路(务必理解,防误导)

| 内容 | 数据来源 | 说明 |
|---|---|---|
| 余额 | 页面里输入的 **API Key** 直连官方 | 显示的是**这把 Key 所属账号**的余额;Key 仅存手机 localStorage |
| token/花费明细 | 你配置的**上游后端**(通常是 PC 上运行 dsh 的用量统计接口 `/api/dsh/usage-stats`) | 反映的是**该上游实际产生的请求**;别的 Key 在别处的花费这里看不到 |

## 架构

```
手机浏览器 (PWA)
 ├─ 直连 https://api.deepseek.com/user/balance   (用页面保存的 API Key)
 └─ /api/dsh/usage-stats  ──► gateway ──► 上游(如 dsh usage-stats 插件账本)
```

## 快速开始

需要 Node ≥ 18。

```bash
# 1) 起 gateway(默认上游是可配置示例;未配置上游时余额仍可用)
node gateway.js              # 或 npm run serve
# 2) 本机验证
curl http://127.0.0.1:8090/api/health
```

- 手机与电脑同一网络:`ipconfig` 查电脑 IPv4,手机浏览器打开 `http://<IP>:8090/`。
- 需要公网/异地访问与"安装到主屏":
  ```powershell
  powershell -File serve-phone.ps1                          # 自动下载 cloudflared,起 HTTPS 隧道
  powershell -File serve-phone.ps1 -NoTunnel                # 仅局域网
  powershell -File serve-phone.ps1 -Target "http://127.0.0.1:3080/api/dsh/usage-stats"
  ```
- 在页面「设置」填入 API Key → 保存并测试(余额);后端地址填 `http(s)://<你的地址>/api/dsh/usage-stats` 可看 token/花费明细。

### gateway 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `PORT`(或 argv[2]) | `8090` | 监听端口(绑定 0.0.0.0) |
| `TARGET`(或 argv[3]) | `http://127.0.0.1:3081/api/dsh/usage-stats` | 上游用量接口 |
| `ACCESS_TOKEN`(或 argv[4]) | 空 | 可选:设置后 `/api/dsh/usage-stats` 需带 `x-access-token` 头 |

## API

| 路由 | 说明 |
|---|---|
| `/` | PWA 页面 |
| `/api/dsh/usage-stats` | 代理上游用量数据(无上游时 502) |
| `/api/health` | 健康检查 |

## 安全提示

- 默认**无鉴权**:若通过公网隧道暴露,拿到链接的人就能读上游用量数据。自用请勿外传链接;
  需要保护时可给 gateway 设置 `ACCESS_TOKEN`,页面暂未内置令牌输入,可用浏览器扩展/代理注入 `x-access-token`。
- API Key 存在手机浏览器 localStorage,请勿在他人设备保存。
- 单机自用且更注重隐私时,建议只用局域网方式,不走公网隧道。

## 开发与测试

```bash
npm test                 # 冒烟测试(起 gateway + 假上游,无需 dsh)
```

结构:`public/`(PWA 静态资源)、`gateway.js`(静态 + 代理)、`serve-phone.ps1`(一键隧道)、
`gen-icons.cjs`(重新生成 PNG 图标)、`test/`。

## 数据口径与免责声明

- 单价/花费为**估算口径**(DeepSeek 曾于 2026-08 调价并实行高峰/低谷计费),上游账本按样本
  时刻分车道累计;金额仅供参考,以官方后台为准。
- 本项目非 DeepSeek 官方产品;不收集任何密钥/数据到第三方(你的 Key 只发给官方接口)。
- 图标为代码自绘,不包含 DeepSeek 商标素材。

## License

[MIT](LICENSE) © 2026 deepseek-usage-dash contributors
