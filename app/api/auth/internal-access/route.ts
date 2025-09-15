// /app/api/auth/internal-access/route.ts (for portfolio.qodeinvest.com)
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  
  console.log('Received token:', token ? 'Token present' : 'No token');
  
  if (!token) {
    console.log('No token provided, redirecting to login');
    return NextResponse.redirect(new URL('/login?error=InvalidToken', request.url));
  }

  try {
    // Verify the JWT token from internal system
    console.log('Verifying token with secret:', process.env.JWT_SECRET ? 'Secret present' : 'No secret');
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    console.log('Decoded token:', decoded);
    
    // Validate token structure
    if (!decoded.client_id || decoded.role !== 'internal_viewer') {
      console.log('Invalid token structure');
      return NextResponse.redirect(new URL('/login?error=InvalidTokenStructure', request.url));
    }

    // Check if token is expired
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      console.log('Token expired');
      return NextResponse.redirect(new URL('/login?error=TokenExpired', request.url));
    }

    // Fetch the client data - using icode since that's what you're passing
    const client = await prisma.clients.findFirst({
      where: { icode: decoded.client_id },
    });

    console.log('Found client:', client ? client.icode : 'No client found');

    if (!client) {
      console.log('Client not found');
      return NextResponse.redirect(new URL('/login?error=ClientNotFound', request.url));
    }

    // Create a session by setting cookies manually or redirect to a custom auth endpoint
    // Since NextAuth doesn't easily allow programmatic sign-in on server side,
    // we'll create a custom session approach
    
    // Create a temporary session token
    const sessionToken = jwt.sign({
      id: client.id.toString(),
      icode: client.icode,
      name: client.user_name,
      email: client.email,
      accessType: 'internal_viewer',
      exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours
    }, process.env.JWT_SECRET!);

    // Redirect to a special page that will handle the authentication
    const authUrl = new URL('/auth/internal-signin', request.url);
    authUrl.searchParams.set('sessionToken', sessionToken);
    
    console.log('Redirecting to internal signin');
    return NextResponse.redirect(authUrl);
    
  } catch (error) {
    console.error('Internal access error:', error);
    return NextResponse.redirect(new URL('/login?error=InternalAccessError', request.url));
  }
}