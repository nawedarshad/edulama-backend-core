const axios = require('axios');

async function checkProduction() {
  const url = 'https://api.edulama.com/core/api/support';
  console.log('Checking production endpoint:', url);
  
  try {
    const res = await axios.get(url);
    console.log('SUCCESS! Production is reachable.');
    console.log('Status:', res.status);
    console.log('Data count:', res.data.length);
  } catch (error) {
    if (error.response) {
      console.log('REACHED but failed with status:', error.response.status);
      console.log('Data:', error.response.data);
    } else {
      console.log('COULD NOT REACH production:', error.message);
    }
  }
}

checkProduction();
