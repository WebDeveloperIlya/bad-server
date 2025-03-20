import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Error as MongooseError } from 'mongoose'
import { REFRESH_TOKEN } from '../config'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import UnauthorizedError from '../errors/unauthorized-error'
import User from '../models/user'

import bcrypt from 'bcryptjs'
import { validationResult } from 'express-validator'
import xss from 'xss'

// POST /auth/login
const AUTH_ACCESS_TOKEN_EXPIRY =
    process.env.AUTH_ACCESS_TOKEN_EXPIRY || 'your_secret'
const AUTH_REFRESH_TOKEN_EXPIRY =
    process.env.AUTH_REFRESH_TOKEN_EXPIRY || 'your_secret'

const register = async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() })

    const { email, password, name } = req.body
    try {
        const existingUser = await User.findOne({ email })
        if (existingUser)
            return res
                .status(400)
                .json({ message: 'Email уже зарегистрирован' })

        const hashedPassword = await bcrypt.hash(password, 10)
        const newUser = new User({ email, password: hashedPassword, name })
        await newUser.save()

        res.status(201).json({
            success: true,
            user: {
                _id: newUser._id,
                email: newUser.email,
                name: xss(newUser.name),
            },
        })
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера' })
    }
}

const login = async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() })

    const { email, password } = req.body
    try {
        const user = await User.findOne({ email })
        if (!user)
            return res.status(400).json({ message: 'Неверные учетные данные' })

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid)
            return res.status(400).json({ message: 'Неверные учетные данные' })

        const accessToken = jwt.sign(
            { userId: user._id },
            AUTH_ACCESS_TOKEN_EXPIRY,
            { expiresIn: '1h' }
        )

        res.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: xss(user.name),
            },
            accessToken,
        })
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера' })
    }
}

// GET /auth/user
const getCurrentUser = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        const user = await User.findById(userId).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.json({ user, success: true })
    } catch (error) {
        next(error)
    }
}

// Можно лучше: вынести общую логику получения данных из refresh токена
const deleteRefreshTokenInUser = async (
    req: Request,
    _res: Response,
    _next: NextFunction
) => {
    const { cookies } = req
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name]

    if (!rfTkn) {
        throw new UnauthorizedError('Не валидный токен')
    }

    const decodedRefreshTkn = jwt.verify(
        rfTkn,
        REFRESH_TOKEN.secret
    ) as JwtPayload
    const user = await User.findOne({
        _id: decodedRefreshTkn._id,
    }).orFail(() => new UnauthorizedError('Пользователь не найден в базе'))

    const rTknHash = crypto
        .createHmac('sha256', REFRESH_TOKEN.secret)
        .update(rfTkn)
        .digest('hex')

    user.tokens = user.tokens.filter((tokenObj) => tokenObj.token !== rTknHash)

    await user.save()

    return user
}

// Реализация удаления токена из базы может отличаться
// GET  /auth/logout
const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteRefreshTokenInUser(req, res, next)
        const expireCookieOptions = {
            ...REFRESH_TOKEN.cookie.options,
            maxAge: -1,
        }
        res.cookie(REFRESH_TOKEN.cookie.name, '', expireCookieOptions)
        res.status(200).json({
            success: true,
        })
    } catch (error) {
        next(error)
    }
}

// GET  /auth/token
const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userWithRefreshTkn = await deleteRefreshTokenInUser(
            req,
            res,
            next
        )
        const accessToken = await userWithRefreshTkn.generateAccessToken()
        const refreshToken = await userWithRefreshTkn.generateRefreshToken()
        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            REFRESH_TOKEN.cookie.options
        )
        return res.json({
            success: true,
            user: userWithRefreshTkn,
            accessToken,
        })
    } catch (error) {
        return next(error)
    }
}

const getCurrentUserRoles = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        await User.findById(userId, req.body, {
            new: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(res.locals.user.roles)
    } catch (error) {
        next(error)
    }
}

const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const updatedUser = await User.findByIdAndUpdate(userId, req.body, {
            new: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

export {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
}
