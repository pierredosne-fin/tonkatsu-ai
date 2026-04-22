import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/tonkatsu-ai/__docusaurus/debug',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug', '86e'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/__docusaurus/debug/config',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug/config', '9ae'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/__docusaurus/debug/content',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug/content', 'c8d'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/__docusaurus/debug/globalData',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug/globalData', '14d'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/__docusaurus/debug/metadata',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug/metadata', '401'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/__docusaurus/debug/registry',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug/registry', '29b'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/__docusaurus/debug/routes',
    component: ComponentCreator('/tonkatsu-ai/__docusaurus/debug/routes', 'ad4'),
    exact: true
  },
  {
    path: '/tonkatsu-ai/docs',
    component: ComponentCreator('/tonkatsu-ai/docs', '3da'),
    routes: [
      {
        path: '/tonkatsu-ai/docs',
        component: ComponentCreator('/tonkatsu-ai/docs', 'd2d'),
        routes: [
          {
            path: '/tonkatsu-ai/docs',
            component: ComponentCreator('/tonkatsu-ai/docs', 'db6'),
            routes: [
              {
                path: '/tonkatsu-ai/docs/api/rest-api',
                component: ComponentCreator('/tonkatsu-ai/docs/api/rest-api', 'b08'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/api/socket-events',
                component: ComponentCreator('/tonkatsu-ai/docs/api/socket-events', '427'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/architecture/agent-workspace',
                component: ComponentCreator('/tonkatsu-ai/docs/architecture/agent-workspace', 'c9b'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/architecture/client',
                component: ComponentCreator('/tonkatsu-ai/docs/architecture/client', 'da3'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/architecture/overview',
                component: ComponentCreator('/tonkatsu-ai/docs/architecture/overview', '468'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/architecture/server',
                component: ComponentCreator('/tonkatsu-ai/docs/architecture/server', 'f42'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/deployment',
                component: ComponentCreator('/tonkatsu-ai/docs/deployment', '7c5'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/examples/first-agent',
                component: ComponentCreator('/tonkatsu-ai/docs/examples/first-agent', 'e4b'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/examples/multi-agent-team',
                component: ComponentCreator('/tonkatsu-ai/docs/examples/multi-agent-team', 'c1c'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/examples/repo-backed-agent',
                component: ComponentCreator('/tonkatsu-ai/docs/examples/repo-backed-agent', '3ca'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/examples/scheduled-tasks',
                component: ComponentCreator('/tonkatsu-ai/docs/examples/scheduled-tasks', '3b9'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/getting-started',
                component: ComponentCreator('/tonkatsu-ai/docs/getting-started', 'f3a'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/intro',
                component: ComponentCreator('/tonkatsu-ai/docs/intro', '857'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/security',
                component: ComponentCreator('/tonkatsu-ai/docs/security', '369'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/tonkatsu-ai/docs/troubleshooting',
                component: ComponentCreator('/tonkatsu-ai/docs/troubleshooting', '402'),
                exact: true,
                sidebar: "docs"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/tonkatsu-ai/',
    component: ComponentCreator('/tonkatsu-ai/', 'f55'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
