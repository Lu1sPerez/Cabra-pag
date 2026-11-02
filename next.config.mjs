/** @type {import('next').NextConfig} */

// Encabezados de seguridad para todas las páginas
const securityHeaders = [
    // Nadie puede mostrar la app dentro de otra página (evita clics engañosos)
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    // El navegador no adivina tipos de archivo
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // No se envía la dirección completa de la app a otros sitios
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // La app no usa cámara, micrófono ni ubicación
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // Siempre por HTTPS
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  ];
  
  const nextConfig = {
    poweredByHeader: false,
    async headers() {
      return [{ source: '/:path*', headers: securityHeaders }];
    },
  };
  
  export default nextConfig;
  