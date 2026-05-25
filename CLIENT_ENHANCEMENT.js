/**
 * CLIENT ENHANCEMENT: Custom Server URL Support
 * 
 * This snippet enhances client/src/main.js to support custom server URLs
 * via URL parameters or browser prompts.
 * 
 * USAGE:
 * 1. Open: http://localhost:3000/
 * 2. Open: http://localhost:3000/?serverUrl=192.168.1.50:3000
 * 3. Open: http://localhost:3000/?serverUrl=game.railway.app
 * 
 * HOW TO INTEGRATE:
 * Add this function to the top of client/src/main.js BEFORE the connect() function
 */

function getServerUrl() {
  // Check for URL parameter
  const params = new URLSearchParams(window.location.search);
  const customUrl = params.get('serverUrl');
  
  if (customUrl) {
    // User provided custom URL
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${customUrl}`;
  }

  // Auto-detect based on current page
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Running locally - connect to localhost
    const port = window.location.port || (protocol === 'wss' ? 443 : 80);
    return `${protocol}://localhost:${port}`;
  }

  // Running on remote server - connect to same server
  return `${protocol}://${window.location.host}`;
}

/**
 * ALTERNATIVE: Interactive Server Selection
 * Uncomment this function if you want users to be prompted to enter a server URL
 */
function getServerUrlInteractive() {
  const params = new URLSearchParams(window.location.search);
  const customUrl = params.get('serverUrl');
  
  if (customUrl) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${customUrl}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Prompt user for server URL
    const input = prompt(
      'Enter server address (e.g., 192.168.1.50:3000 or game.railway.app)',
      'localhost:3000'
    );
    
    if (input) {
      return `${protocol}://${input}`;
    }
    
    // Fallback to localhost
    const port = window.location.port || (protocol === 'wss' ? 443 : 80);
    return `${protocol}://localhost:${port}`;
  }

  // Remote server
  return `${protocol}://${window.location.host}`;
}

/**
 * REPLACEMENT CODE FOR connect() function
 * Replace the existing connect() function in client/src/main.js with this:
 */
async function connect() {
  return new Promise((resolve) => {
    const url = getServerUrl();
    console.log('Connecting to:', url);
    
    socket = new WebSocket(url);
    
    socket.addEventListener('open', () => {
      console.log('Connected!');
      const playerName = prompt('Enter your name:', 'Player');
      socket.send(JSON.stringify({
        type: 'hello',
        name: playerName || 'Player',
      }));
      resolve();
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'welcome') {
        console.log('PlayerId:', message.playerId);
      } else if (message.type === 'state') {
        gameState = message.state;
        gameEvents = message.events;
      }
    });

    socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      console.log('Failed to connect to:', url);
    });

    socket.addEventListener('close', () => {
      console.log('Disconnected from server');
      setTimeout(connect, 3000); // Reconnect after 3 seconds
    });
  });
}

/**
 * HOW TO USE:
 * 
 * LOCAL NETWORK:
 * Share this URL with friends:
 *   http://YOUR_IP:3000/?serverUrl=YOUR_IP:3000
 * 
 * CLOUD DEPLOYMENT:
 * Share this URL:
 *   https://game.railway.app/?serverUrl=game.railway.app
 * 
 * NGROK (temporary):
 * Share this URL:
 *   https://abc123.ngrok.io/?serverUrl=abc123.ngrok.io
 * 
 * TESTING:
 * Open multiple tabs with the same URL to test multiplayer locally
 */
