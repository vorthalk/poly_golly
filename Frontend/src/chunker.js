// chunker.js: Markdown chunking logic for React app

const HEADING_REGEX = /^(#{1,6})\s+(.*)$/;

// Parse all headings in the markdown file
export function parseHeadings(lines) {
  const headings = [];
  lines.forEach((line, idx) => {
    const m = line.match(HEADING_REGEX);
    if (m) {
      headings.push([m[1].length, m[2].trim(), idx]);
    }
  });
  return headings;
}

// Chunk markdown by heading level (and always separate Annexes)
export function chunkMarkdown(lines, headings, chunkLevel, filename) {
  const annexLevels = new Set();
  for (const [level, text] of headings) {
    if (text.toLowerCase().startsWith('annex')) {
      annexLevels.add(level);
    }
  }
  const chunks = [];
  let currentChunk = null;
  let structureStack = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const m = lines[idx].match(HEADING_REGEX);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      
      // If we find a heading that matches our chunk level or is an annex
      if (level === chunkLevel || text.toLowerCase().startsWith('annex')) {
        // If we have a current chunk, end it at the line before this heading
        if (currentChunk !== null) {
          currentChunk.end = idx;
          chunks.push(currentChunk);
        }
        
        // Start a new chunk
        let chunkName;
        if (text.toLowerCase().startsWith('annex')) {
          const annexMatch = text.match(/annex\s*([\w\d]+)/i);
          const annexNum = annexMatch ? annexMatch[1] : text;
          chunkName = `${filename}, Annex ${annexNum}`;
        } else {
          // Build the chunk name from the current heading and its parent structure
          chunkName = filename;
          // Only include headings up to the current level in the name
          const relevantStructure = structureStack.filter(([l]) => l < level);
          for (const [, t] of relevantStructure) {
            chunkName += `, ${t}`;
          }
          chunkName += `, ${text}`;
        }
        currentChunk = { name: chunkName, start: idx, end: null, isAnnex: text.toLowerCase().startsWith('annex') };
      }
      
      // Update the structure stack
      while (structureStack.length && structureStack[structureStack.length - 1][0] >= level) {
        structureStack.pop();
      }
      structureStack.push([level, text]);
    }
  }

  // Handle the last chunk
  if (currentChunk !== null) {
    currentChunk.end = lines.length;
    chunks.push(currentChunk);
  }

  // Handle preface if needed
  if (headings.length && headings[0][2] > 0) {
    // Preface chunk
    chunks.unshift({ name: `${filename}, Preface`, start: 0, end: headings[0][2], isAnnex: false });
  } else if (!headings.length) {
    // Whole file as preface
    chunks.push({ name: `${filename}, Preface`, start: 0, end: lines.length, isAnnex: false });
  }

  return chunks;
}
