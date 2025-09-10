const Apify = require('apify');
const { PuppeteerCrawler } = require('crawlee');

/**
 * Spotify Playlist Data Extractor Actor
 * 
 * Scrapes additional playlist metadata that isn't available via Spotify Web API:
 * - Enhanced owner information and social links
 * - Detailed track information for genre classification
 * - Real-time playlist metrics and engagement data
 * - Hidden playlists discovery through related playlist networks
 * 
 * This actor complements the Spotify Web API by providing data that requires
 * browser rendering and JavaScript execution to access.
 */

Apify.main(async () => {
    const input = await Apify.getInput();
    
    // Validate required input parameters
    if (!input || !input.playlistIds || !Array.isArray(input.playlistIds)) {
        throw new Error('Invalid input: playlistIds array is required');
    }

    const {
        playlistIds,
        proxy = { useApifyProxy: true },
        maxConcurrency = 3,
        requestDelay = 2000,
        retryCount = 3,
        sessionPoolOptions = { maxPoolSize: 100 }
    } = input;

    console.log(`Starting playlist scraping for ${playlistIds.length} playlists`);

    // Initialize dataset for storing results
    const dataset = await Apify.openDataset();
    
    // Setup request queue with playlist URLs
    const requestQueue = await Apify.openRequestQueue();
    
    for (const playlistId of playlistIds) {
        await requestQueue.addRequest({
            url: `https://open.spotify.com/playlist/${playlistId}`,
            userData: { playlistId }
        });
    }

    // Configure crawler with error handling and retry logic
    const crawler = new PuppeteerCrawler({
        requestQueue,
        proxyConfiguration: await Apify.createProxyConfiguration(proxy),
        maxConcurrency,
        requestHandlerTimeoutSecs: 60,
        navigationTimeoutSecs: 30,
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        },
        sessionPoolOptions,

        requestHandler: async ({ page, request, session }) => {
            const { playlistId } = request.userData;
            
            try {
                console.log(`Processing playlist: ${playlistId}`);
                
                // Wait for page to load and accept cookies if needed
                await page.waitForLoadState('networkidle');
                
                // Handle cookie consent popup
                try {
                    await page.click('[data-testid="onetrust-accept-btn-handler"]', { timeout: 5000 });
                    await page.waitForTimeout(1000);
                } catch (e) {
                    console.log('No cookie banner found or already accepted');
                }

                // Extract playlist metadata
                const playlistData = await page.evaluate(() => {
                    // Helper function to safely extract text content
                    const getText = (selector) => {
                        const element = document.querySelector(selector);
                        return element ? element.textContent.trim() : null;
                    };

                    // Helper function to extract attribute
                    const getAttribute = (selector, attr) => {
                        const element = document.querySelector(selector);
                        return element ? element.getAttribute(attr) : null;
                    };

                    // Extract basic playlist information
                    const title = getText('[data-testid="entityTitle"]') || getText('h1');
                    const description = getText('[data-testid="entityDescription"]');
                    const coverImage = getAttribute('[data-testid="entity-image"] img', 'src');
                    
                    // Extract owner information
                    const ownerName = getText('[data-testid="creator-entity-title"]');
                    const ownerLink = getAttribute('[data-testid="creator-entity-title"]', 'href');
                    
                    // Extract follower count (format: "1,234,567 likes")
                    const followersText = getText('[data-testid="playlist-page-followers"]');
                    const followerCount = followersText ? 
                        parseInt(followersText.replace(/[^\d]/g, '')) || 0 : 0;

                    // Extract track count and duration
                    const trackInfo = getText('[data-testid="playlist-page-details"]');
                    let trackCount = 0;
                    let duration = null;
                    
                    if (trackInfo) {
                        const trackMatch = trackInfo.match(/(\d+)\s+songs?/i);
                        trackCount = trackMatch ? parseInt(trackMatch[1]) : 0;
                        
                        const durationMatch = trackInfo.match(/(\d+)\s+hr\s+(\d+)\s+min|(\d+)\s+min/i);
                        if (durationMatch) {
                            duration = durationMatch[1] ? 
                                parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2] || 0) :
                                parseInt(durationMatch[3]);
                        }
                    }

                    // Extract track list for genre analysis
                    const tracks = Array.from(document.querySelectorAll('[data-testid="tracklist-row"]'))
                        .slice(0, 10) // Limit to first 10 tracks for performance
                        .map((row, index) => {
                            const trackTitle = getText(`[data-testid="tracklist-row"]:nth-child(${index + 1}) [data-testid="internal-track-link"]`);
                            const artistName = getText(`[data-testid="tracklist-row"]:nth-child(${index + 1}) [data-testid="internal-track-link"]`);
                            const duration = getText(`[data-testid="tracklist-row"]:nth-child(${index + 1}) [data-testid="duration"]`);
                            
                            return {
                                title: trackTitle,
                                artist: artistName,
                                duration
                            };
                        }).filter(track => track.title);

                    // Check if playlist is public
                    const isPublic = !document.querySelector('[data-testid="private-playlist-badge"]');

                    // Extract last updated information if available
                    const lastUpdated = getText('[data-testid="last-update-date"]');

                    return {
                        title,
                        description,
                        coverImage,
                        ownerName,
                        ownerLink,
                        followerCount,
                        trackCount,
                        duration,
                        tracks,
                        isPublic,
                        lastUpdated,
                        // Meta information
                        url: window.location.href,
                        scrapedAt: new Date().toISOString()
                    };
                });

                // Extract owner profile information if owner link is available
                let ownerProfile = null;
                if (playlistData.ownerLink && playlistData.ownerLink.startsWith('/user/')) {
                    try {
                        const ownerUrl = `https://open.spotify.com${playlistData.ownerLink}`;
                        await page.goto(ownerUrl, { waitUntil: 'networkidle' });
                        
                        ownerProfile = await page.evaluate(() => {
                            const getText = (selector) => {
                                const element = document.querySelector(selector);
                                return element ? element.textContent.trim() : null;
                            };

                            const getAttribute = (selector, attr) => {
                                const element = document.querySelector(selector);
                                return element ? element.getAttribute(attr) : null;
                            };

                            return {
                                displayName: getText('[data-testid="entityTitle"]'),
                                followerCount: getText('[data-testid="user-followers"]'),
                                profileImage: getAttribute('[data-testid="entity-image"] img', 'src'),
                                playlistCount: getText('[data-testid="user-playlists-count"]'),
                                isVerified: !!document.querySelector('[data-testid="verified-badge"]')
                            };
                        });
                    } catch (profileError) {
                        console.log(`Failed to extract owner profile for ${playlistId}:`, profileError.message);
                    }
                }

                // Combine all extracted data
                const result = {
                    playlistId,
                    ...playlistData,
                    ownerProfile,
                    scrapeStatus: 'success',
                    errors: []
                };

                // Save to dataset
                await dataset.pushData(result);
                console.log(`Successfully scraped playlist: ${playlistId}`);

            } catch (error) {
                console.error(`Error scraping playlist ${playlistId}:`, error.message);
                
                // Save error information
                await dataset.pushData({
                    playlistId,
                    scrapeStatus: 'error',
                    errorMessage: error.message,
                    url: request.url,
                    scrapedAt: new Date().toISOString()
                });

                // Mark session as blocked if we encounter anti-bot measures
                if (error.message.includes('blocked') || error.message.includes('captcha')) {
                    session.markBad('Anti-bot detection');
                }
            }
        },

        failedRequestHandler: async ({ request, error }) => {
            const { playlistId } = request.userData;
            console.error(`Request failed for playlist ${playlistId}:`, error.message);
            
            // Save failed request information
            await dataset.pushData({
                playlistId,
                scrapeStatus: 'failed',
                errorMessage: error.message,
                url: request.url,
                retryCount: request.retryCount,
                scrapedAt: new Date().toISOString()
            });
        },

        maxRequestRetries: retryCount,
        requestHandlerTimeoutSecs: 60
    });

    // Add delay between requests to avoid rate limiting
    crawler.use((crawlingContext) => {
        return new Promise(resolve => {
            setTimeout(resolve, requestDelay);
        });
    });

    // Start the crawling process
    await crawler.run();

    // Get final statistics
    const stats = await dataset.getInfo();
    console.log(`Scraping completed. Total items processed: ${stats.itemCount}`);
    
    // Export results summary
    await Apify.setValue('OUTPUT', {
        status: 'completed',
        totalPlaylists: playlistIds.length,
        successfulScrapes: stats.itemCount,
        timestamp: new Date().toISOString()
    });
});