import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CartEngine API',
      version: '1.0.0',
      description: 'Checkout and rewards service. Admin endpoints are prefixed with /api/admin.',
    },
    tags: [
      { name: 'Products', description: 'Product catalog' },
      { name: 'Carts', description: 'Cart management' },
      { name: 'Checkout', description: 'Checkout flow' },
      { name: 'Orders', description: 'Order retrieval' },
      { name: 'Admin', description: 'Administrative operations' },
    ],
    components: {
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            priceCents: { type: 'integer', description: 'Price in cents (e.g. 1999 = $19.99)' },
            inventory: { type: 'integer' },
          },
        },
        CartItem: {
          type: 'object',
          properties: {
            productId: { type: 'string', format: 'uuid' },
            productName: { type: 'string' },
            unitPriceCents: { type: 'integer' },
            quantity: { type: 'integer' },
            lineTotalCents: { type: 'integer' },
            inventory: { type: 'integer' },
          },
        },
        Cart: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['active', 'checked_out'] },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
            subtotalCents: { type: 'integer' },
          },
        },
        OrderItem: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            productName: { type: 'string', description: 'Snapshot of name at checkout time' },
            unitPriceCents: { type: 'integer', description: 'Snapshot of price at checkout time' },
            quantity: { type: 'integer' },
            lineTotalCents: { type: 'integer' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            cartId: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'integer' },
            subtotalCents: { type: 'integer' },
            discountCents: { type: 'integer' },
            totalCents: { type: 'integer' },
            couponId: { type: 'string', nullable: true },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Coupon: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            discountPercent: { type: 'integer' },
            milestoneOrderNumber: { type: 'integer' },
            status: { type: 'string', enum: ['available', 'redeemed'] },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/products': {
        get: {
          tags: ['Products'],
          summary: 'List all products',
          responses: {
            200: { description: 'Product list', content: { 'application/json': { schema: { type: 'object', properties: { products: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } } } } },
          },
        },
      },
      '/api/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product by ID',
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Product details' },
            404: { description: 'PRODUCT_NOT_FOUND', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/carts': {
        post: {
          tags: ['Carts'],
          summary: 'Create a new empty cart',
          responses: { 201: { description: 'Cart created', content: { 'application/json': { schema: { type: 'object', properties: { cart: { $ref: '#/components/schemas/Cart' } } } } } } },
        },
      },
      '/api/carts/{cartId}': {
        get: {
          tags: ['Carts'],
          summary: 'Get cart with items, current prices and subtotal',
          parameters: [{ in: 'path', name: 'cartId', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Cart details' },
            404: { description: 'CART_NOT_FOUND' },
          },
        },
      },
      '/api/carts/{cartId}/items': {
        post: {
          tags: ['Carts'],
          summary: 'Add item to cart (merges quantity if product already in cart)',
          parameters: [{ in: 'path', name: 'cartId', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['productId', 'quantity'], properties: { productId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1 } } } } } },
          responses: {
            201: { description: 'Item added' },
            400: { description: 'VALIDATION_ERROR' },
            404: { description: 'CART_NOT_FOUND or PRODUCT_NOT_FOUND' },
            409: { description: 'CART_ALREADY_CHECKED_OUT' },
          },
        },
      },
      '/api/carts/{cartId}/items/{productId}': {
        put: {
          tags: ['Carts'],
          summary: 'Update item quantity',
          parameters: [
            { in: 'path', name: 'cartId', required: true, schema: { type: 'string', format: 'uuid' } },
            { in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1 } } } } } },
          responses: { 200: { description: 'Item updated' }, 404: { description: 'Item not found' }, 409: { description: 'CART_ALREADY_CHECKED_OUT' } },
        },
        delete: {
          tags: ['Carts'],
          summary: 'Remove item from cart',
          parameters: [
            { in: 'path', name: 'cartId', required: true, schema: { type: 'string', format: 'uuid' } },
            { in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { 204: { description: 'Item removed' }, 404: { description: 'Item not found' }, 409: { description: 'CART_ALREADY_CHECKED_OUT' } },
        },
      },
      '/api/checkout': {
        post: {
          tags: ['Checkout'],
          summary: 'Checkout a cart — idempotent via idempotencyKey',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cartId', 'idempotencyKey'],
                  properties: {
                    cartId: { type: 'string', format: 'uuid' },
                    idempotencyKey: { type: 'string', format: 'uuid', description: 'Client-generated UUID. Retrying with the same key returns the same order without side effects.' },
                    couponCode: { type: 'string', description: 'Optional discount coupon code' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Order created' },
            200: { description: 'Idempotent retry — existing order returned' },
            404: { description: 'CART_NOT_FOUND' },
            409: { description: 'CART_ALREADY_CHECKED_OUT' },
            422: { description: 'INSUFFICIENT_INVENTORY | EMPTY_CART | COUPON_ALREADY_REDEEMED | COUPON_NOT_FOUND' },
          },
        },
      },
      '/api/orders/{orderId}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order by ID with line item price snapshots',
          parameters: [{ in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Order details' }, 404: { description: 'ORDER_NOT_FOUND' } },
        },
      },
      '/api/admin/coupons/generate': {
        post: {
          tags: ['Admin'],
          summary: '[Admin] Generate coupon if an unrewarded milestone is eligible',
          responses: {
            201: { description: 'Coupon generated' },
            409: { description: 'COUPON_MILESTONE_NOT_REACHED or COUPON_ALREADY_GENERATED' },
          },
        },
      },
      '/api/admin/coupons': {
        get: { tags: ['Admin'], summary: '[Admin] List all coupons', responses: { 200: { description: 'All coupons' } } },
      },
      '/api/admin/report': {
        get: { tags: ['Admin'], summary: '[Admin] Revenue and coupon summary report (read-only)', responses: { 200: { description: 'Report data' } } },
      },
      '/api/admin/orders': {
        get: { tags: ['Admin'], summary: '[Admin] List all orders', responses: { 200: { description: 'All orders' } } },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
