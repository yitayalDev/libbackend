const axios = require('axios');
axios.post('http://localhost:5000/api/auth/login', {
    username: 'student',
    password: 'Student@123'
}).then(res => {
    const token = res.data.token;
    return axios.get('http://localhost:5000/api/materials', {
        headers: { Authorization: `Bearer ${token}` }
    });
}).then(res => {
    console.log('Materials fetched:', res.data.materials.length);
    res.data.materials.forEach(m => console.log(` - ${m.title} (${m.fileType})`));
}).catch(err => {
    console.error('Error:', err.response?.data || err.message);
});
