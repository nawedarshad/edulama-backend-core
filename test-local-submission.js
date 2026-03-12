const axios = require('axios');

async function testSubmission() {
  const url = 'http://localhost:3005/core/api/support';
  console.log('Sending test ticket to:', url);
  
  try {
    const res = await axios.post(url, {
      title: 'TEST TICKET - Local Simulation',
      description: 'This is a test ticket sent from a local script to verify the backend flow.',
      name: 'Tester Bot',
      email: 'tester@example.com',
      phone: '1234567890',
      schoolName: 'Test Academy'
    });
    
    console.log('SUCCESS!');
    console.log('Response status:', res.status);
    console.log('Ticket ID:', res.data.id);
  } catch (error) {
    console.error('FAILED!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Message:', error.message);
    }
  }
}

testSubmission();
