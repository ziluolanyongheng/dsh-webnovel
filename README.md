# dsh-webnovel

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的长篇网文写作技能包。把写长篇的整套流程装进智能体：怎么问你、怎么想、怎么写、怎么查重、怎么记住你说过的话。

## 安装

在 DeepSeek Harness 的“添加插件”里填 GitHub 地址：

```text
github:ziluolanyongheng/dsh-webnovel
```

或者用命令行：

```sh
dsh plugin --profile web add github:ziluolanyongheng/dsh-webnovel
```

本包没有构建步骤，不需要 `allowBuilds` 授权。建议锁定到某个 commit：`github:ziluolanyongheng/dsh-webnovel#<sha>`。

查重脚本需要 Node 22.19 以上。

## 技能

| 技能 | 用途 |
|---|---|
| `novel-writer` | 总流程：文件结构、读什么、写之前想什么、一章的循环、连续写、记住用户的话、汇报 |
| `novel-grill` | 开书开卷时怎么问用户，何时问、何时不问 |
| `novel-craft` | 正文写法：爽点、藏底牌、大场面、文风、台词、人物、防公式、卷末自查 |
| `novel-romance` | 成年角色之间的暧昧和言情张力：二十种路数、推进梯子、台词打法 |
| `novel-fanfic` | 同人先读原著学写法，查逐字重合 |
| `novel-check` | 查重脚本和用法 |
| `novel-factcheck` | 事实核查：钱、流程、时间线、机构、诗文 |

技能按需加载，平时不占上下文。也可以在对话里用斜杠命令直接调，比如 `/novel-grill`。

## 用法

```text
我想写一本重生到 2008 年的都市文，帮我开书。
```

智能体会先问几个关键问题，建好专属提示词，然后开始写。之后说“继续写”或者“写到第 30 章”就行。

每本书的规矩、账本和进度都存在书的文件夹里，换会话也接得上。

## 查重脚本

脚本也可以单独用，只依赖 Node：

```sh
node skills/novel-check/scripts/check-chapter.mjs 第12章.md --prev 5
node skills/novel-check/scripts/check-volume.mjs 章节/ --from 41 --to 80
node skills/novel-check/scripts/check-names.mjs 书稿/ 顾长亭 宋知微
```

## 开发

```sh
npm test
```

## 致谢

暧昧手法库里的部分手法整理自公开的写作指南和 [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode) 的题材包，只取手法，不含原文。

## 许可

MIT
