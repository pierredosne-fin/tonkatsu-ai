import { v4 as uuidv4 } from 'uuid';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import type { SkillTemplate } from '../models/types.js';
import { loadSkills, saveSkills } from './persistenceService.js';
import * as fileService from './fileService.js';
import * as agentService from './agentService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSkillCreatorGuide(): string {
  const skillPath = join(
    process.env.HOME ?? '/Users/' + process.env.USER,
    '.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/SKILL.md',
  );
  if (existsSync(skillPath)) {
    return readFileSync(skillPath, 'utf-8');
  }
  return '';
}

let skills: SkillTemplate[] = [];

export function loadAllSkills(): void {
  skills = loadSkills();
}

function persist(): void {
  saveSkills(skills);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getAllSkills(): SkillTemplate[] {
  return [...skills];
}

export function getSkill(id: string): SkillTemplate | undefined {
  return skills.find((s) => s.id === id);
}

export function createSkill(params: {
  name: string;
  description: string;
  content: string;
  tags?: string[];
  category?: string;
}): SkillTemplate {
  const skill: SkillTemplate = {
    id: uuidv4(),
    name: params.name,
    description: params.description,
    content: params.content,
    tags: params.tags,
    category: params.category,
    createdAt: new Date().toISOString(),
  };
  skills.push(skill);
  persist();
  return skill;
}

export function updateSkill(id: string, params: {
  name?: string;
  description?: string;
  content?: string;
  tags?: string[];
  category?: string;
}): SkillTemplate | null {
  const skill = skills.find((s) => s.id === id);
  if (!skill) return null;
  if (params.name !== undefined) skill.name = params.name;
  if (params.description !== undefined) skill.description = params.description;
  if (params.content !== undefined) skill.content = params.content;
  if (params.tags !== undefined) skill.tags = params.tags;
  if (params.category !== undefined) skill.category = params.category;
  persist();
  return skill;
}

export function deleteSkill(id: string): boolean {
  const idx = skills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  skills.splice(idx, 1);
  persist();
  return true;
}

// ── Add skill to agent workspace ──────────────────────────────────────────────

export function addSkillToAgent(skillId: string, agentId: string): boolean {
  const skill = getSkill(skillId);
  if (!skill) return false;
  const agent = agentService.getAgent(agentId);
  if (!agent) return false;
  fileService.writeSkill(agent.workspacePath, skill.name, skill.content);
  return true;
}

// ── AI Generation ─────────────────────────────────────────────────────────────

export async function generateSkillContent(name: string, description: string): Promise<string> {
  const client = new Anthropic();
  const skillCreatorGuide = loadSkillCreatorGuide();

  const systemPrompt = skillCreatorGuide
    ? `You are an expert at writing Claude Code skills following the skill-creator methodology below.\n\n${skillCreatorGuide}\n\n---\n\nYour task: generate a single SKILL.md file. Return ONLY the raw SKILL.md content, no explanations, no markdown code fences.`
    : `You are an expert at writing Claude Code skills. Return ONLY the raw SKILL.md content, no explanations, no markdown code fences.`;

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Create a SKILL.md for a skill named "${name}".

Intent: ${description}

Follow the skill-creator methodology strictly:
- Write a specific, third-person description that includes both WHAT it does and WHEN to trigger it (be slightly "pushy" on triggering)
- Keep SKILL.md concise and under 500 lines
- Use progressive disclosure — only include what's essential in the body
- Explain the why behind instructions, don't just use heavy-handed MUSTs
- No verbose explanations of things Claude already knows

Return ONLY the SKILL.md content starting with the frontmatter (---).`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text;
}
