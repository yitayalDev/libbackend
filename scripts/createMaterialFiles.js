// Create dummy material files for testing downloads
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '..', 'uploads', 'materials');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Create dummy files
const dummyFiles = [
    { name: 'sample-intro-programming.pdf', content: 'This is a dummy PDF file for Introduction to Programming.' },
    { name: 'sample-db-lab-manual.pdf', content: 'This is a dummy PDF file for Database Lab Manual.' },
    { name: 'sample-ds-presentation.pptx', content: 'This is a dummy PowerPoint file for Data Structures.' },
    { name: 'sample-networking.pdf', content: 'This is a dummy PDF file for Networking Fundamentals.' },
    { name: 'sample-se-guide.docx', content: 'This is a dummy Word document for Software Engineering Guide.' }
];

dummyFiles.forEach(file => {
    const filePath = path.join(uploadDir, file.name);
    fs.writeFileSync(filePath, file.content);
    console.log(`Created: ${filePath}`);
});

console.log('\n✅ All dummy material files created successfully!');
