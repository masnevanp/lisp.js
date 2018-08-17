# lisp.js
A simple LISP interpreter implemented in JavaScript (Node). Heavily inspired by Scheme and Clojure.


## To run:
```
> node lisp.js
```

## Syntax
```
def, defn, fn, set!, if, quote, do, let, let*, try, throw, catch, finally
```

### Some examples

#### def - bind an object to a symbol ('assign to a variable')
```
> (def message "Hello, world!")

> message
=> "Hello, world!"
```

#### defn - bind a function to a symbol
```
> (defn add5 (x) (+ 5 x))

> (add5 10)
=> 15
```

#### set! - re-bind a symbol
```
> (def x 10)

> (set! x 20)
```

#### if - (if <test_expr> <true_expr> <false_expr>)
```
> (if true 1 2)
=> 1

> (if false 1 2)
=> 2
```

#### fn - anonymous function
```
> (fn (x) (* 2 x))
```
E.g. bind an anonymous function to a symbol
```
> (def double (fn (x) (* 2 x)))

> (double 21)
=> 42
```

#### do - evaluate expressions
```
> (do
    (print "expressions are evaluated in order")
    "value of last expression is returned")
expressions are evaluated in order
=> "value of last expression is returned"
```

#### let, let* - evaluate expression in a new environment
```
> (let
    ((x 10) (y 20))
    (* x y))
=> 200

> (let*
    ((x 10) (y (* 3 x)))
    (* x y))
=> 300
```

#### try, throw, catch, finally
```
> (try
    (do
      (print "working...")
      (throw Boom "with a bang"))
    (catch Boom b
      (print "caught a boom"))
    (finally
      (print "done"))
  )

working...
caught a boom
done
=> nil
```

### Some 'built-in' functions

*, +, -, 1st, 2nd, 3rd, =, abs, and?, apply, chain, compose, cons, empty?, evalc, exp, false?, inspect, len, list, log, log2, map, map-stream, max, min, next, next?, nil?, nth, or?, pipe, pow, proc?, random, reduce, rest, round, slice, sqrt, str, stream, stream?, sym, sym?, true?
