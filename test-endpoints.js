const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 10000
});

async function testLogin() {
  try {
    const response = await api.post('/auth/login', {
      username: 'admin',
      password: 'admin123',
      role: 'admin'
    });
    console.log('Login success:', response.status, response.data);
  } catch (error) {
    console.log('Login error status:', error.response?.status);
    console.log('Login error data:', error.response?.data);
    console.log('Login error message:', error.message);
  }
}

async function testInventory() {
  try {
    const response = await api.get('/inventory', {
      headers: { Authorization: 'Bearer mock-token' }
    });
    console.log('Inventory success:', response.status);
  } catch (error) {
    console.log('Inventory error status:', error.response?.status);
    console.log('Inventory error data:', error.response?.data);
  }
}

testLogin();
testInventory();
