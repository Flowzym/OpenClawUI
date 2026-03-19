import type { ChangeItem, DiffChunk } from '../../types';
import type { BuildDiffRequest } from './types';

interface DiffOp {
  type: 'context' | 'add' | 'remove';
  line: string;
}

const toLines = (value: string) => value.replace(/\r\n/g, '\n').split('\n');

const lcsMatrix = (before: string[], after: string[]) => {
  const matrix = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      matrix[left][right] = before[left] === after[right]
        ? matrix[left + 1][right + 1] + 1
        : Math.max(matrix[left + 1][right], matrix[left][right + 1]);
    }
  }

  return matrix;
};

const buildOps = (before: string[], after: string[]) => {
  const matrix = lcsMatrix(before, after);
  const ops: DiffOp[] = [];
  let left = 0;
  let right = 0;

  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      ops.push({ type: 'context', line: before[left] });
      left += 1;
      right += 1;
      continue;
    }

    if (matrix[left + 1][right] >= matrix[left][right + 1]) {
      ops.push({ type: 'remove', line: before[left] });
      left += 1;
      continue;
    }

    ops.push({ type: 'add', line: after[right] });
    right += 1;
  }

  while (left < before.length) {
    ops.push({ type: 'remove', line: before[left] });
    left += 1;
  }

  while (right < after.length) {
    ops.push({ type: 'add', line: after[right] });
    right += 1;
  }

  return ops;
};

const summarizeChange = (status: ChangeItem['status'], beforeLines: string[], afterLines: string[]) => {
  if (status === 'added') return `New local file with ${afterLines.length} line${afterLines.length === 1 ? '' : 's'}.`;
  if (status === 'deleted') return `Local deletion of ${beforeLines.length} line${beforeLines.length === 1 ? '' : 's'}.`;

  const delta = afterLines.length - beforeLines.length;
  if (delta === 0) return `Edited ${afterLines.length} line${afterLines.length === 1 ? '' : 's'} locally.`;
  if (delta > 0) return `Added ${delta} line${delta === 1 ? '' : 's'} locally.`;
  return `Removed ${Math.abs(delta)} line${delta === -1 ? '' : 's'} locally.`;
};

const buildChunk = (filePath: string, beforeLines: string[], afterLines: string[]): DiffChunk => {
  const ops = buildOps(beforeLines, afterLines);
  const header = `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`;
  const lines = ops.map((op) => {
    if (op.type === 'add') return `+ ${op.line}`;
    if (op.type === 'remove') return `- ${op.line}`;
    return `  ${op.line}`;
  });

  return {
    id: `${filePath}-chunk-1`,
    header,
    lines,
  };
};

export const buildChangeItem = ({ filePath, before, after }: BuildDiffRequest): ChangeItem | null => {
  if (before === after) return null;

  const beforeLines = toLines(before);
  const afterLines = toLines(after);
  const status: ChangeItem['status'] = before.length === 0 ? 'added' : after.length === 0 ? 'deleted' : 'modified';

  return {
    id: `change-${filePath}`,
    filePath,
    status,
    summary: summarizeChange(status, beforeLines, afterLines),
    chunks: [buildChunk(filePath, beforeLines, afterLines)],
  };
};
