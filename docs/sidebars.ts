import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/server',
        'architecture/client',
        'architecture/agent-workspace',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/rest-api',
        'api/socket-events',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/first-agent',
        'examples/multi-agent-team',
        'examples/repo-backed-agent',
        'examples/scheduled-tasks',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'troubleshooting',
        'security',
        'deployment',
      ],
    },
  ],
};

export default sidebars;
