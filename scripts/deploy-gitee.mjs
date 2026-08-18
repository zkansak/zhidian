import { execSync } from 'node:child_process'
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const user = process.env.GITEE_USER || 'zkansak'
const repo = process.env.GITEE_REPO || 'placement-wizard'
const remote = `https://gitee.com/${user}/${repo}.git`
const dist = join(process.cwd(), 'dist')
const work = join(process.cwd(), '.gitee-pages')

if (!existsSync(dist)) {
  console.error('dist/ 不存在，请先执行 npm run build:gitee')
  process.exit(1)
}

// SPA：Gitee Pages 刷新子路由时回退到 index
cpSync(join(dist, 'index.html'), join(dist, '404.html'))

rmSync(work, { recursive: true, force: true })
execSync(`git clone --depth 1 --branch gh-pages ${remote} "${work}"`, { stdio: 'ignore' })
// clone 失败则新建 orphan 仓库
if (!existsSync(join(work, '.git'))) {
  execSync(`git init -b gh-pages "${work}"`, { stdio: 'inherit' })
  execSync(`git -C "${work}" remote add origin ${remote}`, { stdio: 'inherit' })
}

// 清空工作区（保留 .git）后拷贝 dist
for (const name of execSync('ls -A', { cwd: work, encoding: 'utf8' }).split('\n').filter(Boolean)) {
  if (name === '.git') continue
  rmSync(join(work, name), { recursive: true, force: true })
}
cpSync(dist, work, { recursive: true })
writeFileSync(join(work, '.nojekyll'), '')

execSync('git add -A', { cwd: work, stdio: 'inherit' })
try {
  execSync('git commit -m "deploy: gitee pages"', { cwd: work, stdio: 'inherit' })
} catch {
  console.log('没有文件变更，跳过提交')
}
execSync('git push -u origin gh-pages --force', { cwd: work, stdio: 'inherit' })

console.log(`\n部署完成。请到 Gitee 仓库开启 Pages：`)
console.log(`  https://gitee.com/${user}/${repo}/pages`)
console.log(`预计访问地址：`)
console.log(`  https://${user}.gitee.io/${repo}/`)
