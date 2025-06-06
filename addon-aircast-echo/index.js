const mdns = require('mdns');              // for Chromecast discovery
const { Client: SSDPClient } = require('node-ssdp');
const AirPlayReceiver = require('bonjour')(); // For mDNS advertisement
const CastV2Client = require('castv2-client').Client;
const AlexaCastClient = require('alexa-cast-js').Client;
const http = require('http');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');

const ssdp = new SSDPClient();

// Keep track of discovered devices
const sinks = {
  chromecast: {}, // usn -> { name, client, address }
  echo: {}        // usn -> { name, address }
};

let nextPort = 5000;

// Simplified AirPlay server: accept RAOP and generate HTTP stream URLs
// Note: Replace with a proper RAOP implementation or use the original Aircast code.
const createAirPlayService = (sinkName, port) => {
  // Advertise on mDNS as an AirPlay receiver
  AirPlayReceiver.publish({ name: sinkName, type: 'raop', port: port });

  // Create HTTP server to serve the audio stream (placeholder)
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    // In a real implementation, forward the AirPlay audio here
    res.end();
  });

  server.listen(port, () => {
    console.log(`[Aircast] AirPlay service "${sinkName}" listening on port ${port}`);
  });

  return server;
};

// Placeholder: when an AirPlay client connects, call this event.
// In real Aircast, RAOP handshake and stream handling occurs.
const onAirPlayStream = (sinkName) => {
  const streamUrl = `http://<YOUR_HASS_IP>:${sinks.echo[sinkName]?.port || sinks.chromecast[sinkName]?.port}/stream.mp4`;
  if (sinks.chromecast[sinkName]) {
    // Send to Chromecast (original behavior)
    const { client: ccClient } = sinks.chromecast[sinkName];
    ccClient.launch(require('castv2-client').DefaultMediaReceiver, (err, player) => {
      if (err) {
        console.error('Chromecast launch error:', err);
        return;
      }
      player.load({ contentId: streamUrl, contentType: 'audio/mpeg' }, { autoplay: true });
      console.log(`[Aircast] Streaming to Chromecast "${sinkName}" at ${streamUrl}`);
    });
  } else if (sinks.echo[sinkName]) {
    // Send to Echo via Alexa Cast
    const { address } = sinks.echo[sinkName];
    const alexaClient = new AlexaCastClient({ address: address, port: 8009 });
    alexaClient.connect()
      .then(() => alexaClient.launch({ url: streamUrl, type: 'audio/mp4' }))
      .then(() => console.log(`[Aircast] Streaming to Echo "${sinkName}" at ${streamUrl}`))
      .catch(err => console.error('AlexaCast error:', err));
  }
};

// 1) Chromecast Discovery via mDNS
const browser = mdns.createBrowser(mdns.tcp('googlecast'));
browser.on('serviceUp', (service) => {
  const usn = service.txtRecord.id || service.fullname;
  const sinkName = service.txtRecord.fn + ' (Chromecast)';
  if (!sinks.chromecast[usn]) {
    const client = new CastV2Client();
    client.connect(service.addresses[0], () => {
      sinks.chromecast[usn] = { name: sinkName, client, address: service.addresses[0], port: nextPort };
      createAirPlayService(sinkName, nextPort);
      nextPort++;
      console.log('[Aircast] Discovered Chromecast:', sinkName);
    });
  }
});
browser.start();

// 2) Echo Discovery via SSDP (UPnP)
ssdp.on('response', (headers, statusCode, rinfo) => {
  if (headers.ST && headers.ST.includes('urn:schemas-upnp-org:device:MediaRenderer:1')
      && headers.USN && headers.USN.includes('RINCON')) {
    const usn = headers.USN.split('::')[0];
    const sinkName = `Echo ${rinfo.address} (Aircast)`;
    if (!sinks.echo[usn]) {
      sinks.echo[usn] = { name: sinkName, address: rinfo.address, port: nextPort };
      createAirPlayService(sinkName, nextPort);
      nextPort++;
      console.log('[Aircast] Discovered Echo:', sinkName);
    }
  }
});
// Periodic search
setInterval(() => ssdp.search('urn:schemas-upnp-org:device:MediaRenderer:1'), 30000);
ssdp.search('urn:schemas-upnp-org:device:MediaRenderer:1');

// 3) Placeholder for handling incoming AirPlay connections
// In a full implementation, RAOP server emits an event when ready to play.
// Here we simulate by waiting 10 seconds then calling onAirPlayStream for testing.
setTimeout(() => {
  Object.keys(sinks.echo).forEach(usn => {
    const sinkName = sinks.echo[usn].name;
    console.log(`[Aircast] Simulating AirPlay stream to "${sinkName}"`);
    onAirPlayStream(sinkName);
  });
}, 10000);
