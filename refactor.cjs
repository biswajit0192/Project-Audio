const fs = require('fs');
const path = require('path');

const walk = (dir, filelist = []) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      filelist = walk(filepath, filelist);
    } else {
      filelist.push(filepath);
    }
  }
  return filelist;
};

const files = walk(path.join(__dirname, 'src'));

files.forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. Replace import X from '...svg' -> import X from '...svg?react'
    // Ensure we don't duplicate ?react
    content = content.replace(/(import\s+\w+\s+from\s+['"].*\.svg)(?![\w?]+)(['"])/g, '$1?react$2');

    // 2. We need to find the names of the imported SVG components
    const imports = [...content.matchAll(/import\s+(\w+)\s+from\s+['"].*\.svg\?react['"]/g)].map(m => m[1]);

    // 3. Replace <img src={X} ... /> with <X ... />
    imports.forEach(imgName => {
      // Regex to find <img ... src={imgName} ... /> and convert to <imgName ... />
      // We'll just replace the tag and src attribute
      
      // Case 1: <img src={imgName} alt="..." className="..." />
      const imgRegex = new RegExp(`<img([^>]*)src=\\{${imgName}\\}([^>]*)/>`, 'g');
      content = content.replace(imgRegex, (match, before, after) => {
        // Clean up alt="...", since SVGs don't use alt
        let newAttrs = `${before}${after}`.replace(/alt=['"][^'"]*['"]/g, '');
        // Clean up empty spaces
        newAttrs = newAttrs.replace(/\s{2,}/g, ' ');
        return `<${imgName}${newAttrs}/>`;
      });
      
      // Case 2: src={imgName} inside img but not self-closing or multi-line? We hope it's self-closing.
      // Usually it's self closing in React.
    });

    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Refactored SVG imports/components in: ${file}`);
    }
  } else if (file.endsWith('.scss')) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Remove `filter: invert(...)` lines
    content = content.replace(/^\s*filter:\s*(?:invert|drop-shadow)\(.*?\);\s*$/gm, '');

    // For Sidebar.scss, change active color to $color-prime
    if (file.endsWith('Sidebar.scss')) {
      content = content.replace(/(\.nav-item\.active\s*\{[^}]*?)(\n\s*\})/s, (match, p1, p2) => {
        if (!p1.includes('color: $color-prime')) {
          return p1 + '\n        color: $color-prime;' + p2;
        }
        return match;
      });
    }

    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Cleaned up SCSS in: ${file}`);
    }
  }
});

console.log("Refactoring complete.");
