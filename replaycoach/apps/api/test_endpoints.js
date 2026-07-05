

async function runTest() {
  const email = `coach_${Date.now()}@example.com`;
  const password = 'Password123!';
  const displayName = 'Test Coach';
  const role = 'coach';

  console.log('--- Testing API Endpoints ---');

  // 1. Register
  let userId;
  try {
    const regRes = await fetch('http://localhost:3001/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, role })
    });
    
    console.log(`Register status: ${regRes.status}`);
    const regData = await regRes.json();
    console.log('Register response:', regData);
    if (!regRes.ok) {
      throw new Error(`Register failed: ${JSON.stringify(regData)}`);
    }
    userId = regData.id;
  } catch (err) {
    console.error('Register API Error:', err.message || err);
    return;
  }

  // 2. Login
  let accessToken;
  try {
    const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    console.log(`Login status: ${loginRes.status}`);
    const loginData = await loginRes.json();
    console.log('Login response:', loginData);
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    accessToken = loginData.accessToken;
  } catch (err) {
    console.error('Login API Error:', err.message || err);
    return;
  }

  // 3. Create Session
  let sessionId;
  try {
    const sessRes = await fetch('http://localhost:3001/api/v1/sessions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ scheduledAt: new Date().toISOString(), isInstant: true })
    });

    console.log(`Create Session status: ${sessRes.status}`);
    const sessData = await sessRes.json();
    console.log('Create Session response:', sessData);
    if (!sessRes.ok) {
      throw new Error(`Create Session failed: ${JSON.stringify(sessData)}`);
    }
    sessionId = sessData.id;
  } catch (err) {
    console.error('Create Session API Error:', err.message || err);
  }

  // 4. Get Sessions
  try {
    const getRes = await fetch('http://localhost:3001/api/v1/sessions', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log(`Get Sessions status: ${getRes.status}`);
    const getData = await getRes.json();
    console.log('Get Sessions response (count):', getData.length);
  } catch (err) {
    console.error('Get Sessions API Error:', err.message || err);
  }
}

runTest();
