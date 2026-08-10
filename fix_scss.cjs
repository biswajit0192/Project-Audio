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

const files = walk(path.join(__dirname, 'src')).filter(f => f.endsWith('.scss'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace `img {` with `svg, img {`
  // And `&.queue-btn img {` with `&.queue-btn svg, &.queue-btn img {` -> wait, I changed this to nested in earlier step.
  
  // We can just replace `img {` when preceded by spaces.
  content = content.replace(/(\s+)img\s*\{/g, '$1svg, img {');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated SCSS in: ${file}`);
  }
});
