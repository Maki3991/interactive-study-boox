import type { ArticleContext, MockArticle, MockCategory } from './types'

const webPlan: MockArticle = {
  path: 'ongoing/Web开发/00-学习计划.md',
  fileName: '00-学习计划.md',
  title: 'Web 开发学习计划',
  blocks: [
    { kind: 'heading', level: 1, text: 'Web 开发学习计划' },
    {
      kind: 'paragraph',
      text: '这个学习项目的目标不是背下所有框架和语法，而是能够看懂一个真实功能如何从页面、数据到后端文件读写连起来。',
    },
    { kind: 'heading', level: 2, text: '当前阶段' },
    {
      kind: 'paragraph',
      text: '先完成一个本地运行的互动式学习阅读器。每次只追踪一条完整功能链，确认用户动作、页面变化和数据去向。',
    },
    { kind: 'heading', level: 2, text: '接下来的文章' },
    {
      kind: 'list',
      items: ['浏览器与服务器如何沟通', 'React 页面如何组织', 'Markdown 如何成为学习内容的真源'],
    },
  ],
}

const browserArticle: MockArticle = {
  path: 'ongoing/Web开发/01.md',
  fileName: '01.md',
  title: '浏览器与服务器如何沟通',
  blocks: [
    { kind: 'heading', level: 1, text: '浏览器与服务器如何沟通' },
    {
      kind: 'paragraph',
      text: '当你在网页里点开一篇文章，浏览器本身并不拥有那篇文章。它只是向一个地址发出请求，再把收到的数据组织成你能阅读的页面。',
    },
    {
      kind: 'quote',
      text: '可以先把浏览器理解成“发出请求、展示结果的窗口”，把服务器理解成“决定数据从哪里来、能不能被读取或写入的地方”。',
    },
    { kind: 'heading', level: 2, text: '浏览器负责发起请求' },
    {
      kind: 'paragraph',
      text: '例如点击学习库里的 01.md 时，React 前端会调用一个函数，向本机后端请求这篇文章的内容。前端知道你点了哪一篇，但不应该直接随意读取电脑上的任意文件。',
    },
    {
      kind: 'paragraph',
      text: '因此，前端会把文章的相对路径交给 API；后端检查这个路径仍在学习库内，再读取 Markdown 文件。这样页面与本地文件系统之间有一层清楚的边界。',
    },
    { kind: 'heading', level: 2, text: '服务器负责读取与保护边界' },
    {
      kind: 'paragraph',
      text: '在这个项目里，服务器不是远程租来的机器，而是运行在你电脑上的一个小程序。它未来会扫描 todo、ongoing、archive，读取文章，并在生成下一篇时把新 Markdown 写回正确的项目文件夹。',
    },
    { kind: 'heading', level: 3, text: '为什么不能让前端直接读取文件' },
    {
      kind: 'paragraph',
      text: '普通网页默认没有权限随意访问电脑磁盘。即使某些浏览器提供文件选择能力，也会有权限提示、兼容性和 BOOX 使用上的限制。让本地后端承担文件读写，后续更稳定，也能保护 AI 密钥。',
    },
    { kind: 'heading', level: 2, text: '一次阅读动作的完整链条' },
    {
      kind: 'list',
      items: [
        '你在学习库里点击 01.md。',
        'React 记录当前选择，并请求 GET /api/article。',
        '本机 Express 后端校验路径并读取 Markdown。',
        '后端把原始 Markdown 返回给前端。',
        '前端把 Markdown 渲染成阅读页面。',
      ],
    },
    {
      kind: 'paragraph',
      text: '现在的静态原型只是把这条链中“服务器返回文章”暂时替换成了假数据。等后端建立后，点击行为和阅读区结构会保留，只有假数据的来源会换成真实 API。',
    },
    { kind: 'heading', level: 2, text: '这一节先记住什么' },
    {
      kind: 'paragraph',
      text: '不要把 GET、POST 当成需要死记的咒语。它们只是页面与服务器沟通时对意图的约定：读取文章时主要是 GET，提交反馈并创建下一篇时主要是 POST。',
    },
  ],
}

const reactArticle: MockArticle = {
  path: 'ongoing/Web开发/02.md',
  fileName: '02.md',
  title: 'React 页面如何组织',
  blocks: [
    { kind: 'heading', level: 1, text: 'React 页面如何组织' },
    {
      kind: 'paragraph',
      text: 'React 不要求把所有页面写进一个文件。更常见的做法是让 App 管理整体状态，再把文件树、阅读区、反馈区拆成各自负责的小组件。',
    },
    { kind: 'heading', level: 2, text: '组件的边界' },
    {
      kind: 'paragraph',
      text: '一个组件应该承担一个用户能辨认的界面部分。例如学习库组件只负责显示和展开树；阅读组件只负责显示文章、监听滚动；反馈组件只负责输入和提交状态。',
    },
    { kind: 'heading', level: 2, text: '状态放在哪里' },
    {
      kind: 'paragraph',
      text: '当前文章、侧栏是否展开、当前是否在生成等会影响多个组件的状态，通常放在 App。单个输入框里的文字可以放在反馈组件附近，再通过回调告诉 App。',
    },
  ],
}

const economicsPlan: MockArticle = {
  path: 'ongoing/奥派经济学十讲/00-学习计划.md',
  fileName: '00-学习计划.md',
  title: '奥派经济学十讲学习计划',
  blocks: [
    { kind: 'heading', level: 1, text: '奥派经济学十讲学习计划' },
    {
      kind: 'paragraph',
      text: '从人的行动、主观价值和价格机制开始，逐步理解市场协调和经济计算问题。每篇文章阅读后，根据你的反馈决定下一篇的难度和角度。',
    },
  ],
}

const economicsArticle: MockArticle = {
  path: 'ongoing/奥派经济学十讲/01.md',
  fileName: '01.md',
  title: '为什么从人的行动开始',
  blocks: [
    { kind: 'heading', level: 1, text: '为什么从人的行动开始' },
    {
      kind: 'paragraph',
      text: '经济学并不是先从货币、市场或统计表开始，而是从人如何在有限条件下做选择开始。这个起点决定了后续概念的含义。',
    },
    { kind: 'heading', level: 2, text: '行动不是机械反应' },
    {
      kind: 'paragraph',
      text: '行动意味着一个人认为某种未来状态比当前状态更值得追求，并愿意使用手边的手段去改变它。',
    },
  ],
}

const todoPlan: MockArticle = {
  path: 'todo/英语阅读方法/00-学习计划.md',
  fileName: '00-学习计划.md',
  title: '英语阅读方法学习计划',
  blocks: [
    { kind: 'heading', level: 1, text: '英语阅读方法学习计划' },
    {
      kind: 'paragraph',
      text: '这是一个尚未开始的学习项目。等原材料和学习方向在电脑上整理好后，再手动移入 ongoing。',
    },
  ],
}

const archivedArticle: MockArticle = {
  path: 'archive/维特根斯坦与归纳问题/01.md',
  fileName: '01.md',
  title: '规则与继续：一次归档学习记录',
  blocks: [
    { kind: 'heading', level: 1, text: '规则与继续：一次归档学习记录' },
    {
      kind: 'paragraph',
      text: '这个项目已经归档，但文章仍然可以随时打开复习。归档不代表文章完成度或学习成果的自动判断。',
    },
  ],
}

export const mockLibrary: MockCategory[] = [
  {
    id: 'todo',
    label: 'todo',
    projects: [
      {
        id: 'todo/英语阅读方法',
        name: '英语阅读方法',
        articles: [todoPlan],
      },
    ],
  },
  {
    id: 'ongoing',
    label: 'ongoing',
    projects: [
      {
        id: 'ongoing/Web开发',
        name: 'Web开发',
        articles: [webPlan, browserArticle, reactArticle],
      },
      {
        id: 'ongoing/奥派经济学十讲',
        name: '奥派经济学十讲',
        articles: [economicsPlan, economicsArticle],
      },
    ],
  },
  {
    id: 'archive',
    label: 'archive',
    projects: [
      {
        id: 'archive/维特根斯坦与归纳问题',
        name: '维特根斯坦与归纳问题',
        articles: [archivedArticle],
      },
    ],
  },
]

export const defaultArticlePath = browserArticle.path

export function findArticleContext(path: string): ArticleContext | undefined {
  for (const category of mockLibrary) {
    for (const project of category.projects) {
      const article = project.articles.find((candidate) => candidate.path === path)

      if (article) {
        return { category, project, article }
      }
    }
  }

  return undefined
}

export function getNextArticle(context: ArticleContext): MockArticle | undefined {
  const articleIndex = context.project.articles.findIndex(
    (article) => article.path === context.article.path,
  )

  return context.project.articles[articleIndex + 1]
}
