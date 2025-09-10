/**
 * GET /api/docs
 * 
 * Serves interactive API documentation using Swagger UI.
 * Loads OpenAPI specification and renders interactive interface.
 */

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  
  // If requesting JSON spec
  if (query.format === 'json') {
    setHeader(event, 'Content-Type', 'application/json')
    
    const openApiSpec = await import('~/docs/api-contract.yaml')
    return openApiSpec.default || openApiSpec
  }
  
  // Serve Swagger UI HTML
  setHeader(event, 'Content-Type', 'text/html')
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotify Playlist Discovery API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin: 0;
            background: #fafafa;
        }
        .swagger-ui .topbar {
            background-color: #1db954;
        }
        .swagger-ui .topbar .download-url-wrapper .select-label {
            color: white;
        }
        .swagger-ui .info .title {
            color: #1db954;
        }
        .custom-header {
            background: linear-gradient(135deg, #1db954, #1ed760);
            color: white;
            padding: 20px;
            text-align: center;
            margin-bottom: 20px;
        }
        .custom-header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 300;
        }
        .custom-header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 1.1rem;
        }
    </style>
</head>
<body>
    <div class="custom-header">
        <h1>🎵 Spotify Playlist Discovery API</h1>
        <p>Find popular Spotify playlists by genre with owner contact information</p>
    </div>
    
    <div id="swagger-ui"></div>

    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            // Load OpenAPI specification
            const spec = {
                openapi: '3.0.0',
                info: {
                    title: 'Spotify Playlist Discovery API',
                    version: '1.0.0',
                    description: 'API for discovering popular Spotify playlists by genre with owner contact information',
                    contact: {
                        name: 'API Support',
                        url: 'https://github.com/spotify-playlist-discovery',
                        email: 'support@example.com'
                    },
                    license: {
                        name: 'MIT',
                        url: 'https://opensource.org/licenses/MIT'
                    }
                },
                servers: [
                    {
                        url: window.location.origin + '/api',
                        description: 'Production server'
                    }
                ],
                paths: {
                    '/spotify/genres': {
                        get: {
                            summary: 'Get Available Genres',
                            description: 'Returns all available Spotify genres for playlist searching',
                            operationId: 'getGenres',
                            tags: ['Spotify'],
                            responses: {
                                200: {
                                    description: 'Available genres retrieved successfully',
                                    content: {
                                        'application/json': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    success: { type: 'boolean', example: true },
                                                    data: {
                                                        type: 'array',
                                                        items: { $ref: '#/components/schemas/Genre' }
                                                    },
                                                    metadata: {
                                                        type: 'object',
                                                        properties: {
                                                            totalGenres: { type: 'integer', example: 126 },
                                                            cached: { type: 'boolean', example: false },
                                                            responseTime: { type: 'integer', example: 150 },
                                                            requestId: { type: 'string', example: 'genres_1234567890_abcdef' }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                500: {
                                    description: 'Internal server error',
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '/spotify/search': {
                        post: {
                            summary: 'Search Playlists',
                            description: 'Search for Spotify playlists by genres. Returns exactly 50 playlists.',
                            operationId: 'searchPlaylists',
                            tags: ['Spotify'],
                            requestBody: {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: { $ref: '#/components/schemas/SearchRequest' }
                                    }
                                }
                            },
                            responses: {
                                200: {
                                    description: 'Search completed successfully',
                                    content: {
                                        'application/json': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    success: { type: 'boolean', example: true },
                                                    data: { $ref: '#/components/schemas/SearchResult' },
                                                    metadata: {
                                                        type: 'object',
                                                        properties: {
                                                            totalPlaylists: { type: 'integer', example: 50 },
                                                            executionTime: { type: 'integer', example: 2500 },
                                                            cached: { type: 'boolean', example: false },
                                                            requestId: { type: 'string' }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                400: {
                                    description: 'Invalid request parameters',
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                                        }
                                    }
                                },
                                429: {
                                    description: 'Rate limit exceeded',
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '/spotify/playlist/{id}': {
                        get: {
                            summary: 'Get Playlist Details',
                            description: 'Get detailed information about a specific playlist',
                            operationId: 'getPlaylist',
                            tags: ['Spotify'],
                            parameters: [
                                {
                                    name: 'id',
                                    in: 'path',
                                    required: true,
                                    schema: {
                                        type: 'string',
                                        pattern: '^[0-9A-Za-z]{22}$',
                                        example: '37i9dQZF1DXcBWIGoYBM5M'
                                    },
                                    description: 'Spotify playlist ID (22 alphanumeric characters)'
                                }
                            ],
                            responses: {
                                200: {
                                    description: 'Playlist details retrieved successfully',
                                    content: {
                                        'application/json': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    success: { type: 'boolean', example: true },
                                                    data: { $ref: '#/components/schemas/Playlist' },
                                                    metadata: {
                                                        type: 'object',
                                                        properties: {
                                                            cached: { type: 'boolean' },
                                                            responseTime: { type: 'integer' },
                                                            requestId: { type: 'string' }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                404: {
                                    description: 'Playlist not found',
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '/export': {
                        post: {
                            summary: 'Export Search Results',
                            description: 'Export playlist search results to JSON or CSV format',
                            operationId: 'exportResults',
                            tags: ['Export'],
                            requestBody: {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            required: ['format', 'data'],
                                            properties: {
                                                format: {
                                                    type: 'string',
                                                    enum: ['json', 'csv'],
                                                    example: 'json'
                                                },
                                                data: { $ref: '#/components/schemas/SearchResult' }
                                            }
                                        }
                                    }
                                }
                            },
                            responses: {
                                200: {
                                    description: 'Export completed successfully',
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ExportData' },
                                            example: {
                                                success: true,
                                                data: {
                                                    metadata: {
                                                        exportDate: '2025-09-10T12:00:00.000Z',
                                                        searchCriteria: { genres: ['pop'], minFollowers: 0 },
                                                        totalPlaylists: 50
                                                    },
                                                    playlists: []
                                                }
                                            }
                                        },
                                        'text/csv': {
                                            schema: { type: 'string' },
                                            example: 'name,url,followers,tracks,ownerName\\n"Today\'s Top Hits","https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",32000000,50,"Spotify"'
                                        }
                                    }
                                },
                                400: {
                                    description: 'Invalid export request',
                                    content: {
                                        'application/json': {
                                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '/health': {
                        get: {
                            summary: 'Health Check',
                            description: 'Check API health and status',
                            operationId: 'healthCheck',
                            tags: ['System'],
                            responses: {
                                200: {
                                    description: 'Service is healthy',
                                    content: {
                                        'application/json': {
                                            schema: {
                                                type: 'object',
                                                properties: {
                                                    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                                                    timestamp: { type: 'string', format: 'date-time' },
                                                    uptime: { type: 'number' },
                                                    version: { type: 'string' },
                                                    checks: { type: 'object' },
                                                    performance: { type: 'object' }
                                                }
                                            }
                                        }
                                    }
                                },
                                503: {
                                    description: 'Service is unhealthy'
                                }
                            }
                        }
                    }
                },
                components: {
                    schemas: {
                        Genre: {
                            type: 'object',
                            required: ['name', 'displayName'],
                            properties: {
                                name: { type: 'string', example: 'pop' },
                                displayName: { type: 'string', example: 'Pop' },
                                relatedGenres: { type: 'array', items: { type: 'string' }, example: ['dance-pop', 'electropop'] }
                            }
                        },
                        SearchRequest: {
                            type: 'object',
                            required: ['genres'],
                            properties: {
                                genres: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    minItems: 1,
                                    maxItems: 10,
                                    example: ['pop', 'rock']
                                },
                                minFollowers: { type: 'integer', minimum: 0, example: 1000 },
                                maxFollowers: { type: 'integer', minimum: 0, example: 1000000 },
                                market: { type: 'string', pattern: '^[A-Z]{2}$', example: 'US' },
                                enhanceWithScraping: { type: 'boolean', example: false }
                            }
                        },
                        Playlist: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', example: '37i9dQZF1DXcBWIGoYBM5M' },
                                name: { type: 'string', example: 'Today\\'s Top Hits' },
                                description: { type: 'string', example: 'The most played tracks on Spotify' },
                                url: { type: 'string', example: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
                                externalUrl: { type: 'string', example: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' },
                                imageUrl: { type: 'string', example: 'https://i.scdn.co/image/example.jpg' },
                                followerCount: { type: 'integer', example: 32000000 },
                                trackCount: { type: 'integer', example: 50 },
                                owner: { $ref: '#/components/schemas/PlaylistOwner' },
                                genres: { type: 'array', items: { type: 'string' }, example: ['pop', 'top hits'] },
                                popularity: { type: 'integer', minimum: 0, maximum: 100, example: 100 },
                                lastUpdated: { type: 'string', format: 'date-time' },
                                isPublic: { type: 'boolean', example: true }
                            }
                        },
                        PlaylistOwner: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', example: 'spotify' },
                                displayName: { type: 'string', example: 'Spotify' },
                                profileUrl: { type: 'string', example: 'https://open.spotify.com/user/spotify' },
                                imageUrl: { type: 'string', example: 'https://i.scdn.co/image/user.jpg' },
                                followerCount: { type: 'integer', example: 500000 },
                                contactInfo: {
                                    type: 'object',
                                    properties: {
                                        username: { type: 'string', example: 'spotify' },
                                        profileUrl: { type: 'string' },
                                        isContactPublic: { type: 'boolean', example: true },
                                        socialLinks: { type: 'array', items: { type: 'object' } },
                                        contactStatus: { type: 'string', enum: ['public', 'limited', 'private'] }
                                    }
                                }
                            }
                        },
                        SearchResult: {
                            type: 'object',
                            properties: {
                                requestId: { type: 'string' },
                                playlists: { type: 'array', items: { $ref: '#/components/schemas/Playlist' } },
                                totalFound: { type: 'integer', example: 50 },
                                searchMetadata: {
                                    type: 'object',
                                    properties: {
                                        executionTime: { type: 'integer', example: 1500 },
                                        genresSearched: { type: 'array', items: { type: 'string' } },
                                        genresNotFound: { type: 'array', items: { type: 'string' } },
                                        apiCallsCount: { type: 'integer', example: 3 },
                                        cacheHit: { type: 'boolean', example: false },
                                        warnings: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            }
                        },
                        ExportData: {
                            type: 'object',
                            properties: {
                                metadata: {
                                    type: 'object',
                                    properties: {
                                        exportDate: { type: 'string', format: 'date-time' },
                                        searchCriteria: { type: 'object' },
                                        totalPlaylists: { type: 'integer' }
                                    }
                                },
                                playlists: { type: 'array', items: { type: 'object' } }
                            }
                        },
                        ErrorResponse: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean', example: false },
                                error: {
                                    type: 'object',
                                    properties: {
                                        code: { type: 'string', example: 'INVALID_GENRE' },
                                        message: { type: 'string', example: 'One or more genres are invalid' },
                                        suggestions: { type: 'array', items: { type: 'string' } },
                                        retryable: { type: 'boolean', example: false }
                                    }
                                },
                                requestId: { type: 'string' }
                            }
                        }
                    },
                    securitySchemes: {
                        ApiKeyAuth: {
                            type: 'apiKey',
                            in: 'header',
                            name: 'X-API-Key'
                        }
                    }
                },
                security: [],
                tags: [
                    { name: 'Spotify', description: 'Spotify playlist operations' },
                    { name: 'Export', description: 'Data export operations' },
                    { name: 'System', description: 'System monitoring and health' }
                ]
            };

            // Initialize Swagger UI
            SwaggerUIBundle({
                url: '/api/docs?format=json',
                spec: spec,
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                tryItOutEnabled: true,
                requestInterceptor: function(request) {
                    // Add any default headers here
                    request.headers['X-Request-Source'] = 'swagger-ui';
                    return request;
                },
                responseInterceptor: function(response) {
                    // Log responses in development
                    if (window.location.hostname === 'localhost') {
                        console.log('API Response:', response);
                    }
                    return response;
                }
            });
        };
    </script>
</body>
</html>
  `
})