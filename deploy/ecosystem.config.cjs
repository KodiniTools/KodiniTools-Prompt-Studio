// PM2-Konfiguration. Bewusst OHNE env-Block: Geheimnisse stehen nur in der .env
// (Rechte 600) und landen so nicht im Klartext in ~/.pm2/dump.pm2.
module.exports = {
  apps: [
    {
      name: 'prompt-studio',
      cwd: '/opt/prompt-studio',
      script: 'dist-server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '200M',
    },
  ],
}
