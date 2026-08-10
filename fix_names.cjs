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

    // 1. Find all imports and uppercase the first letter
    const importRegex = /import\s+([a-z]\w*)\s+from\s+['"](.*\.svg\?react)['"]/g;
    
    let match;
    const renames = [];
    while ((match = importRegex.exec(content)) !== null) {
      const oldName = match[1];
      const newName = oldName.charAt(0).toUpperCase() + oldName.slice(1);
      renames.push({ oldName, newName });
    }

    // 2. Apply renames
    renames.forEach(({ oldName, newName }) => {
      // Replace import
      content = content.replace(new RegExp(`import\\s+${oldName}\\s+from`), `import ${newName} from`);
      
      // Replace JSX elements <oldName ... />
      content = content.replace(new RegExp(`<${oldName}(|\\s+[^>]*)>`, 'g'), `<${newName}$1>`);
      
      // Replace any other usages (like in ternary src={isCollapsed ? oldName : ...})
      // We will just do a global word replacement for the component
      // Note: we must be careful not to replace parts of other words
      const wordRegex = new RegExp(`\\b${oldName}\\b`, 'g');
      content = content.replace(wordRegex, newName);
    });

    // 3. Fix the ternary `src={isCollapsed ? LogoSymbol : LogoMain}` manually if it exists
    // We'll replace the `<img src={...} />` with the components directly
    const ternaryRegex = /<img[^>]*src=\{([^}]+)\}[^>]*\/>/g;
    content = content.replace(ternaryRegex, (match, srcCode) => {
      // If it's a ternary `isCollapsed ? LogoSymbol : LogoMain`
      if (srcCode.includes('?')) {
        // We can't automatically parse perfectly, but let's try a simple heuristic or leave it for manual
        // Let's just output a console warning so we can fix it manually
        console.log(`Manual fix needed for dynamic img src in ${file}: ${srcCode}`);
        return match;
      }
      return match;
    });

    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Fixed component names in: ${file}`);
    }
  }
});
