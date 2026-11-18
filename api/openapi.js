/**
 * @openapi
 * tags:
 *   - name: Public
 *     description: Public catalog, site content, and contact operations.
 *   - name: Admin
 *     description: Admin session and protected content-management operations.
 *
 * components:
 *   securitySchemes:
 *     adminSession:
 *       type: apiKey
 *       in: cookie
 *       name: travelhorizon_admin
 *       description: HttpOnly session cookie set by a successful admin login.
 *     csrfToken:
 *       type: apiKey
 *       in: header
 *       name: X-CSRF-Token
 *       description: Obtain the token from GET /api/admin/session.
 *   schemas:
 *     Error:
 *       type: object
 *       required: [error]
 *       properties:
 *         error:
 *           type: string
 *         code:
 *           type: string
 *       example:
 *         error: Request verification failed.
 *     SaveResult:
 *       type: object
 *       required: [saved]
 *       properties:
 *         saved:
 *           type: boolean
 *           enum: [true]
 *       example:
 *         saved: true
 *     LocalizedContent:
 *       type: object
 *       additionalProperties:
 *         type: string
 *         maxLength: 2000
 *       example:
 *         site.title: TravelHorizon
 *     Content:
 *       type: object
 *       description: Translation keys grouped by the supported language codes.
 *       properties:
 *         en:
 *           $ref: '#/components/schemas/LocalizedContent'
 *         ru:
 *           $ref: '#/components/schemas/LocalizedContent'
 *         ky:
 *           $ref: '#/components/schemas/LocalizedContent'
 *       additionalProperties: false
 *       example:
 *         en:
 *           site.title: TravelHorizon
 *         ru: {}
 *         ky: {}
 *     CatalogImage:
 *       type: object
 *       required: [url, credit, sourceUrl, license, licenseUrl]
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *           description: HTTPS image URL hosted on thumb.wikimedia.org or upload.wikimedia.org.
 *         credit:
 *           type: string
 *           maxLength: 160
 *         sourceUrl:
 *           type: string
 *           format: uri
 *         license:
 *           type: string
 *           maxLength: 160
 *         licenseUrl:
 *           type: string
 *           format: uri
 *     TourFields:
 *       type: object
 *       required: [label, location, title, price, activity, season, description, includes, alt]
 *       properties:
 *         label:
 *           type: string
 *         location:
 *           type: string
 *         title:
 *           type: string
 *           minLength: 1
 *         price:
 *           type: string
 *         activity:
 *           type: string
 *         season:
 *           type: string
 *         description:
 *           type: string
 *         includes:
 *           type: string
 *         alt:
 *           type: string
 *           minLength: 1
 *     ExperienceFields:
 *       type: object
 *       required: [kicker, title, location, price, copy, includes, alt]
 *       properties:
 *         kicker:
 *           type: string
 *         title:
 *           type: string
 *           minLength: 1
 *         location:
 *           type: string
 *         price:
 *           type: string
 *         copy:
 *           type: string
 *         includes:
 *           type: string
 *         alt:
 *           type: string
 *           minLength: 1
 *     LocalizedTourFields:
 *       type: object
 *       required: [en, ru, ky]
 *       properties:
 *         en:
 *           $ref: '#/components/schemas/TourFields'
 *         ru:
 *           $ref: '#/components/schemas/TourFields'
 *         ky:
 *           $ref: '#/components/schemas/TourFields'
 *     LocalizedExperienceFields:
 *       type: object
 *       required: [en, ru, ky]
 *       properties:
 *         en:
 *           $ref: '#/components/schemas/ExperienceFields'
 *         ru:
 *           $ref: '#/components/schemas/ExperienceFields'
 *         ky:
 *           $ref: '#/components/schemas/ExperienceFields'
 *     Tour:
 *       type: object
 *       required: [id, fields, image, tags]
 *       properties:
 *         id:
 *           type: string
 *           pattern: '^[a-z0-9][a-z0-9-]{0,39}$'
 *         fields:
 *           $ref: '#/components/schemas/LocalizedTourFields'
 *         image:
 *           $ref: '#/components/schemas/CatalogImage'
 *         tags:
 *           type: array
 *           minItems: 1
 *           uniqueItems: true
 *           items:
 *             type: string
 *             enum: [trekking, water, culture]
 *     Experience:
 *       type: object
 *       required: [id, fields, image, topic, listingUrl]
 *       properties:
 *         id:
 *           type: string
 *           pattern: '^[a-z0-9][a-z0-9-]{0,39}$'
 *         fields:
 *           $ref: '#/components/schemas/LocalizedExperienceFields'
 *         image:
 *           $ref: '#/components/schemas/CatalogImage'
 *         topic:
 *           type: string
 *           enum: [horse, yurt, trek, canyon, food, eagle]
 *         listingUrl:
 *           type: string
 *           description: Empty or an HTTPS operator listing URL.
 *     Catalog:
 *       type: object
 *       required: [tours, experiences]
 *       properties:
 *         tours:
 *           type: array
 *           maxItems: 50
 *           items:
 *             $ref: '#/components/schemas/Tour'
 *         experiences:
 *           type: array
 *           maxItems: 50
 *           items:
 *             $ref: '#/components/schemas/Experience'
 *     CatalogResponse:
 *       type: object
 *       required: [catalog]
 *       properties:
 *         catalog:
 *           type: object
 *           nullable: true
 *           required: [tours, experiences]
 *           properties:
 *             tours:
 *               type: array
 *               maxItems: 50
 *               items:
 *                 $ref: '#/components/schemas/Tour'
 *             experiences:
 *               type: array
 *               maxItems: 50
 *               items:
 *                 $ref: '#/components/schemas/Experience'
 *       example:
 *         catalog:
 *           tours: []
 *           experiences: []
 *     ContactEnquiry:
 *       type: object
 *       required: [name, email, travelers, interest]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         email:
 *           type: string
 *           format: email
 *           maxLength: 254
 *         tour:
 *           type: string
 *           description: Optional ID of a currently listed tour.
 *         travelers:
 *           oneOf:
 *             - type: integer
 *               minimum: 1
 *               maximum: 20
 *             - type: string
 *               description: A value that converts to an integer from 1 through 20.
 *         interest:
 *           type: string
 *           enum: [general, partner, experience, horse, yurt, food, trek, canyon, eagle]
 *         message:
 *           type: string
 *           maxLength: 2000
 *         language:
 *           type: string
 *           enum: [en, ru, ky]
 *           default: en
 *       example:
 *         name: Aida Example
 *         email: aida@example.com
 *         tour: ala
 *         travelers: 2
 *         interest: general
 *         message: We are interested in September dates.
 *         language: en
 *
 * /api/content:
 *   get:
 *     tags: [Public]
 *     summary: Get the site's localized content
 *     operationId: getContent
 *     responses:
 *       '200':
 *         description: Content keyed by language and translation key.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Content'
 *             example:
 *               en:
 *                 site.title: TravelHorizon
 *               ru: {}
 *               ky: {}
 *       '500':
 *         description: The content store could not serve the request.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/catalog:
 *   get:
 *     tags: [Public]
 *     summary: Get the tours and experiences catalog
 *     operationId: getCatalog
 *     responses:
 *       '200':
 *         description: The current catalog, or null if no catalog has been imported.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CatalogResponse'
 *             example:
 *               catalog:
 *                 tours: []
 *                 experiences: []
 *       '500':
 *         description: The catalog store could not serve the request.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/contact:
 *   post:
 *     tags: [Public]
 *     summary: Submit a contact or travel enquiry
 *     description: Requires a same-origin browser request. A successful enquiry is sent to the configured Telegram chat; Telegram credentials are never part of this API.
 *     operationId: submitContactEnquiry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactEnquiry'
 *     responses:
 *       '200':
 *         description: The enquiry was delivered.
 *         content:
 *           application/json:
 *             example:
 *               sent: true
 *       '400':
 *         description: Invalid JSON or enquiry fields.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: The request Origin did not match this site.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '413':
 *         description: Request body exceeds the accepted size.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '429':
 *         description: Too many enquiries were submitted from this address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '502':
 *         description: Telegram could not deliver the enquiry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Telegram integration is not configured.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: The content or catalog store could not serve the enquiry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/admin/login:
 *   post:
 *     tags: [Admin]
 *     summary: Sign in to the admin panel
 *     description: Requires a same-origin request. Success sets an HttpOnly admin session cookie; submit credentials only over HTTPS in production.
 *     operationId: adminLogin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       '200':
 *         description: Signed in; the response sets the session cookie.
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly travelhorizon_admin session cookie.
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             example:
 *               authenticated: true
 *       '400':
 *         description: Request body is not valid JSON.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Username or password is incorrect.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: The request Origin did not match this site.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '413':
 *         description: Request body exceeds the accepted size.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '429':
 *         description: Too many failed sign-in attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/admin/session:
 *   get:
 *     tags: [Admin]
 *     summary: Get the current admin session and CSRF token
 *     operationId: getAdminSession
 *     security:
 *       - adminSession: []
 *     responses:
 *       '200':
 *         description: The current session and token used by protected write operations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [authenticated, csrfToken]
 *               properties:
 *                 authenticated:
 *                   type: boolean
 *                   enum: [true]
 *                 csrfToken:
 *                   type: string
 *       '401':
 *         description: No valid admin session exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/admin/content:
 *   put:
 *     tags: [Admin]
 *     summary: Replace all localized site content
 *     description: Requires a valid admin session, a same-origin request, and the CSRF token returned by GET /api/admin/session.
 *     operationId: replaceContent
 *     security:
 *       - adminSession: []
 *         csrfToken: []
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         description: Must match the request host and protocol.
 *         schema:
 *           type: string
 *           format: uri
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 $ref: '#/components/schemas/Content'
 *           example:
 *             content:
 *               en:
 *                 site.title: TravelHorizon
 *               ru: {}
 *               ky: {}
 *     responses:
 *       '200':
 *         description: Content was replaced.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SaveResult'
 *       '400':
 *         description: Invalid JSON or localized content.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: No valid admin session exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Origin or CSRF verification failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '413':
 *         description: Request body exceeds the accepted size.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Content could not be saved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     tags: [Admin]
 *     summary: Clear all localized site content
 *     description: Requires a valid admin session, a same-origin request, and the CSRF token returned by GET /api/admin/session.
 *     operationId: clearContent
 *     security:
 *       - adminSession: []
 *         csrfToken: []
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         description: Must match the request host and protocol.
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Content was cleared.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SaveResult'
 *       '401':
 *         description: No valid admin session exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Origin or CSRF verification failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Content could not be saved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/admin/catalog:
 *   put:
 *     tags: [Admin]
 *     summary: Replace the tours and experiences catalog
 *     description: Requires a valid admin session, a same-origin request, and the CSRF token returned by GET /api/admin/session. Image URLs and their source/license URLs must use HTTPS; images must be hosted on Wikimedia Commons.
 *     operationId: replaceCatalog
 *     security:
 *       - adminSession: []
 *         csrfToken: []
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         description: Must match the request host and protocol.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [catalog]
 *             properties:
 *               catalog:
 *                 $ref: '#/components/schemas/Catalog'
 *           example:
 *             catalog:
 *               tours: []
 *               experiences: []
 *     responses:
 *       '200':
 *         description: Catalog was replaced.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SaveResult'
 *       '400':
 *         description: Invalid JSON or catalog data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: No valid admin session exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Origin or CSRF verification failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '413':
 *         description: Request body exceeds the accepted size.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Catalog could not be saved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     tags: [Admin]
 *     summary: Clear the tours and experiences catalog
 *     description: Requires a valid admin session, a same-origin request, and the CSRF token returned by GET /api/admin/session.
 *     operationId: clearCatalog
 *     security:
 *       - adminSession: []
 *         csrfToken: []
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         description: Must match the request host and protocol.
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Catalog was cleared.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SaveResult'
 *       '401':
 *         description: No valid admin session exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Origin or CSRF verification failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Catalog could not be saved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *
 * /api/admin/logout:
 *   post:
 *     tags: [Admin]
 *     summary: End the current admin session
 *     description: Requires a valid admin session, a same-origin request, and the CSRF token returned by GET /api/admin/session.
 *     operationId: adminLogout
 *     security:
 *       - adminSession: []
 *         csrfToken: []
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         description: Must match the request host and protocol.
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Session was ended and the cookie was cleared.
 *         content:
 *           application/json:
 *             example:
 *               loggedOut: true
 *       '401':
 *         description: No valid admin session exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Origin or CSRF verification failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '503':
 *         description: Admin access is not configured for this deployment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
