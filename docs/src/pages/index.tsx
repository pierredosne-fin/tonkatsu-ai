import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <img src="/img/tonkatsu.png" alt="Tonkatsu" className={styles.heroLogo} />
        <h1 className={styles.heroTitle}>
          Your AI team,{' '}
          <span className={styles.heroTitleAccent}>always at work</span>
        </h1>
        <p className={styles.heroSub}>
          A self-hosted virtual office where Claude Code agents run autonomously in named rooms,
          delegate tasks to each other, and stream results live to your browser —
          while you stay in control.
        </p>
        <div className={styles.heroCtas}>
          <Link className={styles.ctaPrimary} to="/docs/intro">
            Read the Docs
          </Link>
          <Link
            className={styles.ctaSecondary}
            href="https://github.com/pierredosne-fin/data-platform-tonkatsu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </Link>
        </div>

        {/* App screenshot placeholder */}
        <div className={styles.screenshotWrap}>
          <div className={styles.screenshotFrame}>
            <div className={styles.screenshotBar}>
              <span className={styles.dot} style={{background:'#ff5f57'}} />
              <span className={styles.dot} style={{background:'#febc2e'}} />
              <span className={styles.dot} style={{background:'#28c840'}} />
              <span className={styles.screenshotUrl}>tonkatsu — office</span>
            </div>
            <div className={styles.screenshotBody}>
              <p className={styles.screenshotPlaceholder}>
                Drop your app screenshot here
              </p>
            </div>
          </div>
          {/* glow underneath */}
          <div className={styles.screenshotGlow} />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: '🏢',
    title: 'Virtual Office Grid',
    desc: 'Agents occupy rooms in a 5×3 grid. See which agents are running, idle, pending input, or sleeping — at a glance. Click any room to open a chat.',
  },
  {
    icon: '⚡',
    title: 'Real-Time Streaming',
    desc: 'Every token streams live to the browser via Socket.IO. Tool calls, inter-agent delegations, and status changes are all visible as they happen — no polling, no refresh.',
  },
  {
    icon: '🔀',
    title: 'Agent Delegation',
    desc: 'Agents hand off work to each other using a simple tag: <CALL_AGENT name="analyst">…</CALL_AGENT>. Up to 5 levels deep, with full traceability in the UI.',
  },
  {
    icon: '🌿',
    title: 'Repo-Backed Agents',
    desc: 'Tie an agent to a git repo. It gets its own branch and worktree — code changes are tracked, identity and memory files stay private via info/exclude.',
  },
  {
    icon: '🕐',
    title: 'Cron Schedules',
    desc: 'Set agents to run tasks on a cron expression. Daily standups, monitoring alerts, data syncs — all automated, all logged in conversation history.',
  },
  {
    icon: '🧩',
    title: 'Templates & Skills',
    desc: 'Snapshot any live agent or team into a reusable template. Reinstantiate with one API call. Share a skill library across all agents to standardize how they work.',
  },
];

function Features() {
  return (
    <section className={styles.features}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Everything your AI team needs</h2>
        <p className={styles.sectionSub}>
          Built on the Anthropic Claude API — no babysitting required.
        </p>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.featureCard}>
              <span className={styles.featureIcon}>{f.icon}</span>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className={styles.screenshotSection}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Up and running in minutes</h2>
        <p className={styles.sectionSub}>
          No infrastructure to provision. No database to configure. Just clone, set your API key, and go.
        </p>
        <div className={styles.showcaseRow}>
          <div className={styles.showcaseText}>
            <div className={styles.showcaseStep}>
              <span className={styles.stepBadge}>01</span>
              <div>
                <strong>Wire up your API key</strong>
                <p>
                  Clone the repo, add your Anthropic API key to <code>server/.env</code>, and run{' '}
                  <code>npm run dev</code>. The office grid loads at localhost:5173.
                </p>
              </div>
            </div>
            <div className={styles.showcaseStep}>
              <span className={styles.stepBadge}>02</span>
              <div>
                <strong>Create agents with identities</strong>
                <p>
                  Each agent gets a name, a mission, and a persistent workspace with identity files
                  (SOUL.md, OPS.md, MEMORY.md). Give an agent a git repo and it works directly in your codebase.
                </p>
              </div>
            </div>
            <div className={styles.showcaseStep}>
              <span className={styles.stepBadge}>03</span>
              <div>
                <strong>Send tasks and watch them collaborate</strong>
                <p>
                  Agents stream output live, call tools, and hand off work to each other.
                  They pause when they need you and keep going when you reply.
                </p>
              </div>
            </div>
          </div>
          <div className={styles.showcaseScreenshot}>
            <div className={styles.showcasePlaceholder}>
              {`// Example: PM delegates to analyst\n\nconst pm = await createAgent({\n  name: 'pm',\n  mission: 'Break down goals,\\ndelegate to specialists.',\n});\n\n// PM's output triggers delegation:\n// <CALL_AGENT name="analyst">\n//   Research Q1 AI trends\n// </CALL_AGENT>\n\n// Server intercepts → runs analyst\n// → injects result back into pm\n// → pm synthesizes final answer`}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Screenshot() {
  return (
    <section className={styles.screenshotSection}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>See it in action</h2>
        <p className={styles.sectionSub}>
          Agents collaborate, stream output, and delegate — all in one view.
        </p>

        {/* Two-column: text + screenshot */}
        <div className={styles.showcaseRow}>
          <div className={styles.showcaseText}>
            <div className={styles.showcaseStep}>
              <span className={styles.stepBadge}>01</span>
              <div>
                <strong>Send a task</strong>
                <p>Type a message to any agent. It starts immediately — no setup, no prompting beyond the mission you defined.</p>
              </div>
            </div>
            <div className={styles.showcaseStep}>
              <span className={styles.stepBadge}>02</span>
              <div>
                <strong>Watch it work</strong>
                <p>Streaming output, tool calls (Bash, Read, Write, WebSearch), and inter-agent delegations appear in real time as the agent works through the task.</p>
              </div>
            </div>
            <div className={styles.showcaseStep}>
              <span className={styles.stepBadge}>03</span>
              <div>
                <strong>Review & approve</strong>
                <p>Agents pause with <code>&lt;NEED_INPUT&gt;</code> when they hit a decision only you can make. You stay in the loop without being in the way.</p>
              </div>
            </div>
          </div>
          <div className={styles.showcaseScreenshot}>
            <div className={styles.showcasePlaceholder}>
              Drop a second screenshot here
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className={styles.ctaSection}>
      <div className={styles.ctaInner}>
        <img src="/img/tonkatsu.png" alt="" className={styles.ctaLogo} aria-hidden />
        <h2 className={styles.ctaTitle}>Ready to build your AI team?</h2>
        <p className={styles.ctaSub}>Open-source. Self-hosted. Your API key never leaves your server.</p>
        <div className={styles.heroCtas}>
          <Link className={styles.ctaPrimary} to="/docs/intro">
            Get started
          </Link>
          <Link className={styles.ctaSecondary} href="https://github.com/pierredosne-fin/data-platform-tonkatsu">
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline} noFooter={false}>
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Screenshot />
        <CTA />
      </main>
    </Layout>
  );
}
