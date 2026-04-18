export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(msg: string) {
    super(400, msg);
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') {
    super(401, msg);
  }
}

export class ForbiddenError extends AppError {
  constructor(msg = 'Forbidden') {
    super(403, msg);
  }
}

export class NotFoundError extends AppError {
  constructor(msg = 'Not found') {
    super(404, msg);
  }
}

export class ConflictError extends AppError {
  constructor(msg: string) {
    super(409, msg);
  }
}
