const axios = require('axios');

async function testProductionPost() {
  const url = 'https://api.edulama.com/core/api/support';
  console.log('Sending TEST ticket to production:', url);
  
  try {
    const res = await axios.post(url, {
      title: 'PRODUCTION TEST',
      description: 'Verifying if production API saves to DB.',
      name: 'Prod Tester',
      email: 'prod@test.com'
    });
    
    console.log('SUCCESS!');
    console.log('Ticket ID:', res.data.id);
  } catch (error) {
    console.error('FAILED!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data));
    } else {
      console.error('Message:', error.message);
    }
  }
}

testProductionPost();
